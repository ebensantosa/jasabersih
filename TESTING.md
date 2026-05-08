# JasaBersih — End-to-End Testing Guide

Panduan test integrasi penuh: customer book → bayar → cleaner accept → kerja → selesai → rating → wallet → withdraw.

## Prereq Setup

### 1. Production sudah live
- Admin: https://dashboard.jasabersih.com
- API: https://api.jasabersih.com/v1/health → harus return `{"status":"ok"}`
- Mobile: build via `npm run start -w @jasabersih/mobile` lalu scan QR di Expo Go

### 2. Env credentials sudah di-set di VPS `.env`
```
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
R2_BUCKET_PRIVATE=jasabersih-private
R2_BUCKET_PUBLIC=jasabersih-public
R2_PUBLIC_BASE_URL=https://cdn.jasabersih.com
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (min 64 char)
```

### 3. Tripay (opsional, untuk test payment)
Set di `/admin/app-settings`:
- `payment.tripay_merchant_code`
- `payment.tripay_api_key`
- `payment.tripay_private_key`
- `payment.tripay_base_url` (sandbox: `https://tripay.co.id/api-sandbox`)

Whitelist callback URL di Tripay merchant dashboard: `https://api.jasabersih.com/v1/payments/callback`

### 4. Setup admin
- Default seed: `admin@jasabersih.com` / `admin123` (WAJIB ganti)
- `/admin/settings → Admin Users` → tambah admin role lain (ops, finance, fraud_analyst, support)

---

## Test Skenario A: Customer Flow (Pesan + Bayar + Rating)

### A1. Daftar customer baru
1. Mobile → **Sign up** (atau register screen)
2. Input no HP → terima OTP (cek log API: `pm2 logs jasabersih-api`)
3. Input nama, password, **kode referral** dari user lain (opsional — test referral)
4. Login otomatis ke home

**Expected:** User created di DB (`SELECT * FROM users WHERE phone='...'`), token JWT issued, mode=customer

### A2. Tambah alamat
1. Profile tab → **Alamat Tersimpan** → Tambah
2. Pin lokasi di peta + isi label/recipient/HP/detail
3. Save → muncul di list dengan badge "Default"

**Expected:** `addresses` table baru, `is_default=true`

### A3. Buat booking (paket harga)
1. Home → tap salah satu service (mis. "Bersih Kamar")
2. Pilih paket → "Pesan Sekarang"
3. Step Properti: tipe rumah, lantai, jumlah kamar
4. Step Kondisi: dirt level (1-5), karakter, foto
5. Step Jadwal: tanggal + jam + alamat
6. Apply voucher code (jika ada test voucher di `/admin/vouchers`)
7. Tap "Buat Pesanan"

**Expected:** Booking masuk dgn status `pending_payment`, total amount benar (basePrice + dirtSurcharge - voucher)

### A4. Bayar via Tripay (skip jika belum setup Tripay)
1. Booking detail → "Bayar Rp X"
2. Payment screen → pilih metode (BCAVA / QRIS / OVO / dll)
3. Detail tampil: VA number / QR + countdown
4. Test bayar di Tripay sandbox simulator
5. **Auto-poll** detect status `paid` → success screen → redirect ke booking detail

**Expected:**
- `payments.status='paid'`, `paid_at` filled
- `bookings.status='searching'`, `paid_at` filled
- Push notif customer: "Pembayaran berhasil — mencari cleaner"
- `incoming-job` event broadcast ke cleaners online

### A5. Customer batalin booking dalam 10 detik (gratis)
1. Setelah pay, langsung tap "Batal (10s gratis)"
2. Confirm

**Expected:** `bookings.status='cancelled'`, no penalty

---

## Test Skenario B: Cleaner Flow (KYC + Accept + Kerja + Withdraw)

### B1. Setup cleaner baru
1. Mobile → register dengan mode `freelancer` (atau switch mode di profile setelah login)
2. Profile → **Profil Cleaner** → set bio, area, brings_tools

### B2. KYC upload
1. Profile → **Verifikasi KYC** (atau langsung `/cleaner/kyc`)
2. Upload 3 foto: KTP, Selfie+KTP, Buku Tabungan (camera atau galeri)
3. Status → `under_review`

**Expected (admin side):** `/admin/kyc` → tab Pending → cleaner muncul dgn 3 doc count

### B3. Admin approve KYC
1. Admin login → `/admin/kyc` → tab Pending
2. Klik "Review" → modal preview 3 doc (signed URL R2)
3. Tap "Approve"

**Expected:**
- `cleaner_profiles.kyc_status='approved'`, `approved_at` filled
- Push notif cleaner: "KYC disetujui ✓"
- Cleaner sekarang bisa terima job

### B4. Cleaner go online + accept job
1. Mobile cleaner → tab Job Board
2. Toggle **Online** ON → server `is_available=true` + socket join `cleaners:available` room
3. Customer (skenario A) bayar → `incoming-job` event broadcast
4. **RealtimeJobModal** muncul di cleaner mobile dgn countdown 30s + detail
5. Tap **Accept**

**Expected:**
- Atomic UPDATE: `bookings.cleaner_id=cleaner_id, status='matched'`
- Customer dapat push: "Cleaner ditemukan!"
- Cleaner lain di room dapat `job-taken` event → modal close
- Booking muncul di "Job Aktif" cleaner

### B5. Cleaner advance status
1. Booking detail → tap **Berangkat (OTW)** → status `on_the_way`, push customer "Cleaner menuju lokasi 🚗"
2. Tap **Mulai Kerja** → status `in_progress`, push customer "Cleaner sudah sampai ✓"
3. Upload foto Sebelum + Sesudah (camera, R2 public bucket)
4. Tap **Selesai** → status `completed`:
   - Push customer "Yuk beri rating"
   - Auto-credit cleaner ledger (cleaner_payout, status CLEARED)
   - `cleaner_profiles.total_jobs_done +1`

### B6. Customer beri rating
1. Customer mobile → booking detail → tombol "Beri Rating"
2. Pilih bintang 1-5, review opsional, tip preset
3. Submit

**Expected:**
- `ratings` row inserted (UNIQUE per booking)
- `cleaner_profiles.rating_avg + rating_count` recompute
- Tip → ledger entry `earnings` CLEARED
- Push cleaner: "Kamu dapat rating ⭐"

### B7. Cleaner cek wallet + tarik saldo
1. Mobile cleaner → tab Pendapatan → saldo bertambah
2. Tap "Tarik Saldo" → input bank + amount
3. Submit (validasi: min 50K dari `app_config.feature.min_withdrawal`, KYC approved, saldo cukup)

**Expected:**
- Withdrawal row `pending`
- Ledger debit row `PENDING` (saldo "di-hold")
- Server-side balance display turun

### B8. Admin approve withdrawal
1. Admin → `/admin/wallet` → tab Pending
2. Tap Approve → input ref bank transfer

**Expected:**
- `withdrawals.review_status='approved', status='paid'`
- Ledger debit `CLEARED`
- Push cleaner: "Penarikan disetujui Rp X — Ref: XXX"

---

## Test Skenario C: Anti-fraud + Dispute

### C1. Auto-block off-platform leak di chat
1. Customer + cleaner saling chat di booking
2. Customer kirim "WA aku 081234567890" atau "transfer BCA aja"
3. Pesan **TIDAK terkirim** ke cleaner, customer dapat warning merah

**Expected:**
- `chat_messages.status='blocked', block_reason='wa_mention'/'phone_number'/etc`
- `fraud_strikes` baru utk customer
- `/admin/chat → Blocked Messages` menampilkan log

### C2. Dispute create dari customer
1. Booking status matched/in_progress/completed → tap **Laporkan Masalah**
2. Pilih jenis (kualitas/no_show/theft/payment/harassment), deskripsi 10+ char, upload foto evidence
3. Submit

**Expected:**
- `disputes` row `status='open'`, SLA 24 jam
- Subject = the other party (cleaner)
- Evidence keys di R2 private bucket

### C3. Admin resolve dispute
1. Admin → `/admin/disputes` → tab Open → klik Detail
2. Modal: lihat deskripsi + signed URL evidence
3. Pilih action: refund_customer / debit_cleaner / suspend_subject / warn_both / dismiss
4. Input resolution + amount (jika refund/debit)
5. Submit

**Expected:**
- `disputes.status='resolved'`
- Both parties dapat push "Sengketa selesai"
- Jika debit_cleaner / suspend_subject → `fraud_strikes` baru utk cleaner

### C4. Auto fraud detection (cron tiap 1 jam)
- Tunggu sampai `:00` menit, atau force run di `/admin/fraud → Force Run`
- Detect: high cancel rate, high refund rate, shared device, off-platform chat
- 7-day dedup

**Expected:** `fraud_strikes` baru muncul di `/admin/fraud`

---

## Test Skenario D: Referral Loop

### D1. User A bagikan kode
1. User A → Profile → **Referral & Bonus** → kode auto-generate (e.g. `XK7P3MR`)
2. Tap Share → native share sheet

### D2. User B daftar pakai kode
1. New user → register/verify → input `referralCode: XK7P3MR`
2. Sukses signup

**Expected:** `referrals` row `referrer_id=A, referred_id=B, status='pending'`

### D3. User B order pertama + complete
1. User B booking + bayar + cleaner kerjain + complete
2. Total order >= `referral.min_order_amount` (default 100K)

**Expected (auto-trigger di force-complete + cleaner advance to completed):**
- `referrals.status='qualified'`, `bonus_amount=25000`
- User A ledger credit `+Rp 25.000` CLEARED
- `referral_codes.total_referrals +1, total_paid +25000`
- Push User A: "Bonus referral masuk! 🎉"

### D4. Admin verify referral
- `/admin/referrals → Overview` → User A jadi top 1 leaderboard
- `/admin/referrals → Semua Referral` → row dengan badge "qualified" + Rp 25.000

---

## Test Skenario E: CMS + Push Broadcast

### E1. Admin update banner
1. `/admin/content → Banner` → Tambah Banner
2. Upload image (auto ke R2 public)
3. Set placement `home_hero`, schedule, link
4. Save

**Expected:** Mobile home → BannerCarousel auto-load (within 5 min /v1/app/content TTL)

### E2. Admin update logo
1. `/admin/app-settings → brand.logo_url` → Edit
2. Upload PNG/SVG → URL auto-set

**Expected:** Mobile login screen → BrandLogo show new image

### E3. Admin push broadcast
1. `/admin/broadcast` → compose title + body + audience (mis. "all" / "new_customer_7d")
2. Estimate panel show audience size + reachable
3. Send → confirm

**Expected:**
- All matched users dapat push notif
- Logged di `notification_logs` + `admin_audit_log`
- History tab: count sent/failed

---

## Sanity Checks

### Backend logs
```bash
ssh deploy@VPS_IP
sudo -iu deploy pm2 logs jasabersih-api --lines 100 --nostream
```

### Database queries
```bash
ssh deploy@VPS_IP
sudo -u postgres psql jasabersih

-- User counts
SELECT
  COUNT(*) FILTER (WHERE is_customer) AS customers,
  COUNT(*) FILTER (WHERE is_freelancer) AS cleaners
FROM users;

-- Pending action counts
SELECT
  (SELECT COUNT(*) FROM cleaner_profiles WHERE kyc_status IN ('pending','under_review')) AS kyc_pending,
  (SELECT COUNT(*) FROM withdrawals WHERE review_status='pending') AS withdrawal_pending,
  (SELECT COUNT(*) FROM disputes WHERE status='open') AS disputes_open;

-- Recent bookings
SELECT id, status, total_amount, paid_at, completed_at
FROM bookings ORDER BY created_at DESC LIMIT 5;

-- Wallet balance check
SELECT user_id,
  SUM(CASE WHEN account_type='earnings' THEN amount ELSE 0 END) -
  SUM(CASE WHEN account_type='withdrawal' AND status IN ('PENDING','CLEARED') THEN amount ELSE 0 END) AS balance
FROM wallet_ledger_entries
WHERE user_id='<cleaner_uuid>'
GROUP BY user_id;
```

### Health endpoints
```bash
curl https://api.jasabersih.com/v1/health
curl https://api.jasabersih.com/v1/app/content | jq .data.config
```

### Real-time chat test (browser console)
```js
const s = io('wss://api.jasabersih.com/chat', { auth: { token: 'YOUR_JWT' }});
s.on('connect', () => console.log('connected'));
s.emit('join', { bookingId: 'xxx' }, console.log);
s.emit('send', { bookingId: 'xxx', content: 'hi' }, console.log);
```

---

## Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| 500 INTERNAL_ERROR | BigInt serialize / missing env var | Check pm2 logs, biasanya dari `getOrThrow` config key not set |
| Mobile push tidak masuk | Expo token belum register | Login di physical device (sim/web tidak support push); cek `user_devices.fcm_token` |
| Tripay webhook 401 | Signature mismatch | Cek `x-callback-signature` header sama dengan HMAC private_key + raw body |
| Image upload 403 | R2 CORS belum allow origin | Cloudflare R2 → bucket → Settings → CORS Policy → add `https://dashboard.jasabersih.com` |
| Voucher tidak valid | Window/quota/per-user limit habis | Cek `vouchers` table + `voucher_usage` count |

---

## Rollback (kalau deploy gagal)

Auto-rollback sudah built-in di `deploy/deploy.sh` — kalau health check gagal, akan revert ke commit sebelumnya. Manual rollback:

```bash
ssh deploy@VPS_IP
cd /var/www/jasabersih
git log --oneline -5
git reset --hard <previous_commit>
bash deploy/deploy.sh
```
