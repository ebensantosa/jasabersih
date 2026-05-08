# Analytics & Tracking — JasaBersih

## Rekomendasi Stack

### Mobile App (customer + cleaner) — Firebase Analytics

**Why Firebase:**
- ✅ Gratis unlimited events
- ✅ Native Expo support (`expo-firebase-analytics` di-deprecate, gunakan `@react-native-firebase/analytics` via Expo Dev Client, atau `expo-application` + Firebase JS SDK untuk web)
- ✅ Backend = GA4 (data flow ke dashboard Google Analytics biasa)
- ✅ Auto-track: screen views, session, retention, demographics, devices
- ✅ Custom events (booking_created, payment_paid, rating_submitted, etc)
- ✅ BigQuery export gratis untuk SQL custom report
- ✅ Audience segments → bisa kombinasi dgn FCM push targeted
- ✅ A/B testing built-in via Firebase Remote Config

**Setup steps (mobile):**
1. Buat project Firebase di https://console.firebase.google.com
2. Tambah app Android + iOS, download `google-services.json` + `GoogleService-Info.plist`
3. `npm install @react-native-firebase/app @react-native-firebase/analytics`
4. Build Expo Dev Client (bukan Expo Go — perlu native module)
5. Track event: `analytics().logEvent('booking_created', { service: 'kamar', total: 150000 })`

**Events yang harus di-track (custom):**
- `signup` (auto), `login`
- `booking_created` (props: serviceCode, pricingMode, totalAmount)
- `payment_attempted` / `payment_succeeded` / `payment_failed`
- `cleaner_accept_job`
- `booking_completed`
- `rating_submitted` (props: rating, tipAmount)
- `referral_code_applied`
- `voucher_applied`

### Web Admin Dashboard — Google Analytics 4 langsung

**Setup:**
1. Bikin GA4 property baru (atau pakai property mobile, kalau mau gabung)
2. Embed gtag.js di `apps/admin/app/layout.tsx`
3. Track halaman + admin actions

**Code snippet** (next push kalau mau):
```tsx
// apps/admin/app/layout.tsx
<Script src={`https://www.googletagmanager.com/gtag/js?id=G-XXXXX`} strategy="afterInteractive" />
<Script id="ga4" strategy="afterInteractive">{`
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXX');
`}</Script>
```

### Backend (NestJS API) — internal logging

Sudah ada:
- `admin_audit_log` — semua admin actions tercatat
- `notification_logs` — push notif sent/failed
- `data_access_log` — UU PDP compliance (siapa baca chat/PII)

Untuk metrics performa:
- **Sentry** (free tier 5K errors/month) — error tracking + perf monitoring
- **PostHog self-hosted** (Docker, free) — kalau mau full ownership data

## Alternatif (kalau Firebase ga cocok)

| Tool | Pros | Cons | Cost |
|---|---|---|---|
| **Mixpanel** | Funnel + retention + cohort terbaik | Berbayar setelah 100K events/month | $20-200/mo |
| **Amplitude** | Mirip Mixpanel, UI lebih bagus | Sama berbayar | $0 → $$$ |
| **PostHog** | Self-hosted, full control, includes session recording | Maintain server sendiri (1 VPS) | Free (self-host) |
| **Plausible** | Privacy-first, simple, no cookies | Web only, bukan event tracking detail | $9-19/mo |

## Cost estimate (production scale)

Asumsi:
- 10K MAU
- 100K events/month
- 5K bookings/month

**Firebase + GA4**: $0/month (gratis)
**Mixpanel**: $25/month
**Amplitude**: $0 (Starter, sampai 10M events/month free now)
**PostHog self-hosted**: ~$5/month (VPS small)

## Saran konkret untuk JasaBersih

1. **Sekarang**: pakai Firebase Analytics untuk mobile (data sudah lengkap untuk decision-making)
2. **+3 bulan** kalau perlu deeper funnel: tambah PostHog (free, self-hosted di VPS yg sama)
3. **+6 bulan**: integrasi BigQuery export untuk custom revenue report

Total cost analytics tetap **$0/month** untuk MVP.

## Setup Firebase Analytics — Step by Step

(Siapkan sebelum kontak: nama project, support email)

1. **Buat Firebase project**:
   - https://console.firebase.google.com → Add project
   - Project name: `jasabersih`
   - Enable Google Analytics → buat akun GA baru atau pakai existing
   - Pilih Indonesia timezone

2. **Tambah Android app**:
   - Package name: `com.jasabersih.app` (sama dgn `app.json` android.package)
   - Download `google-services.json` → simpan di `apps/mobile/google-services.json` (jangan commit, add ke `.gitignore`)

3. **Tambah iOS app**:
   - Bundle ID: `com.jasabersih.app`
   - Download `GoogleService-Info.plist` → `apps/mobile/GoogleService-Info.plist`

4. **Install Expo plugin**:
   ```bash
   cd apps/mobile
   npx expo install @react-native-firebase/app @react-native-firebase/analytics
   ```

5. **Update `app.json`**:
   ```json
   {
     "expo": {
       "plugins": ["@react-native-firebase/app"],
       "android": { "googleServicesFile": "./google-services.json" },
       "ios": { "googleServicesFile": "./GoogleService-Info.plist" }
     }
   }
   ```

6. **Build Dev Client** (Expo Go tidak support):
   ```bash
   eas build --profile development --platform android
   ```

7. **Track events di kode**:
   ```ts
   import analytics from '@react-native-firebase/analytics';

   await analytics().logEvent('booking_created', {
     service_code: 'kamar',
     pricing_mode: 'package',
     total_amount: 150000,
   });
   ```

8. **Verify**: Firebase Console → DebugView → real-time event muncul

## Yang Wajib Tracked untuk Marketplace

| Event | Properties | Why |
|---|---|---|
| `signup` | mode (customer/cleaner), referral_code | Acquisition channel |
| `booking_started` | service_code | Funnel start |
| `booking_completed_form` | service_code, total | Form completion rate |
| `payment_initiated` | method, amount | Payment funnel |
| `payment_succeeded` | method, amount, fee | Conversion |
| `cleaner_kyc_submitted` | doc_count | Cleaner activation |
| `cleaner_kyc_approved` | days_to_approve | Time-to-active |
| `job_accepted` | response_time_sec | Cleaner responsiveness |
| `job_completed` | duration_min | Service quality |
| `rating_submitted` | stars, has_review, has_tip | Customer satisfaction |
| `withdrawal_requested` | amount, days_since_first_job | Cleaner LTV |

Semua ini gratis di Firebase Analytics + bisa di-cross dengan revenue di BigQuery.
