-- Seed default static pages — admin bisa edit di /admin/content → Halaman Statis
INSERT INTO cms_pages (slug, title, body_markdown, audience, is_published) VALUES
  ('about',
   'Tentang JasaBersih',
$md$
# Tentang JasaBersih

JasaBersih.com adalah platform marketplace cleaning service di Indonesia yang menghubungkan customer dengan cleaner profesional terverifikasi.

## Misi Kami
Menyediakan layanan kebersihan **berkualitas, transparan, dan aman** untuk semua orang.

## Kenapa JasaBersih?
- Cleaner ter-verifikasi KYC (KTP + selfie + buku tabungan)
- Harga jelas, tidak ada biaya tersembunyi
- Garansi pekerjaan + asuransi kerusakan
- Rating & review transparan
- Pembayaran aman via app

## Kontak
- Email: halo@jasabersih.com
- WhatsApp: 0812-3456-7890
$md$,
   'public', TRUE),

  ('terms',
   'Syarat & Ketentuan',
$md$
# Syarat & Ketentuan

Berlaku sejak: 8 Mei 2026

## 1. Penggunaan Layanan
Dengan menggunakan aplikasi JasaBersih, kamu menyetujui:
- Memberikan informasi yang akurat saat registrasi
- Tidak menyalahgunakan layanan untuk tujuan ilegal
- Tidak mencoba bypass biaya komisi platform

## 2. Pembayaran
- Semua pembayaran wajib melalui app (no off-platform deal)
- Penalty 25% jika cancel di luar window 10 detik free-cancel setelah pembayaran
- Refund full kalau cleaner tidak datang

## 3. Cleaner
- Wajib KYC approved sebelum terima order
- Komisi: tanpa alat 40%, bawa alat 50-60% (tergantung order size)
- Min withdrawal Rp 50.000

## 4. Tanggung Jawab
- Kerusakan barang ringan (< Rp 500K) ditanggung cleaner
- Kerusakan besar diselesaikan via dispute center, asuransi sampai Rp 10jt
- Customer wajib menyimpan barang berharga sebelum service

## 5. Privasi
Lihat Kebijakan Privasi terpisah untuk detail penanganan data pribadi.

## 6. Perubahan
JasaBersih berhak mengubah T&C ini sewaktu-waktu. Notifikasi akan dikirim via push 14 hari sebelum berlaku.
$md$,
   'public', TRUE),

  ('privacy',
   'Kebijakan Privasi',
$md$
# Kebijakan Privasi

Berlaku sejak: 8 Mei 2026

## Data yang Kami Kumpulkan
- **Profil**: nama, no HP, email, foto profil
- **Lokasi**: untuk matching cleaner terdekat
- **Pembayaran**: nomor rekening (untuk withdrawal cleaner)
- **KYC**: foto KTP, selfie, buku tabungan (cleaner only, encrypted at rest)
- **Aktivitas**: booking history, chat, rating

## Cara Kami Pakai Data
- Mencocokkan customer dengan cleaner terdekat
- Memproses pembayaran via gateway pihak ketiga (Tripay)
- Mengirim notifikasi push terkait booking
- Mendeteksi fraud (auto-detect off-platform deal di chat)

## Berbagi Data
Kami **TIDAK** menjual data ke pihak ketiga. Data hanya dibagikan ke:
- Payment gateway (Tripay) untuk proses transaksi
- Pengadilan/aparat penegak hukum jika diwajibkan secara hukum

## Hak Anda (UU PDP)
- Akses data pribadi yang kami simpan
- Minta koreksi data yang salah
- Minta penghapusan akun + data (kecuali yg wajib disimpan untuk audit finansial)
- Tarik persetujuan kapan saja

## Retensi Data
- Chat: dihapus otomatis setelah 40 hari
- Foto pekerjaan: dihapus otomatis setelah 40 hari
- Booking record: di-anonymize setelah 40 hari (kecuali ID, total, status untuk audit)

## Kontak DPO
Untuk pertanyaan privasi: privacy@jasabersih.com
$md$,
   'public', TRUE),

  ('faq',
   'FAQ',
$md$
# Frequently Asked Questions

## Pembatalan & Refund

### Bagaimana cara batalkan pesanan?
Buka tab Pesanan → pilih order → tap **Batalkan**.

### Apakah ada biaya cancel?
- **0-10 detik** setelah bayar: gratis
- **>10 detik**: kena potongan 25% dari total

### Berapa lama refund cair?
Refund kembali ke metode pembayaran asli dalam 1-3 hari kerja.

## Cleaner & Pekerjaan

### Berapa lama cleaner sampai?
Rata-rata 30-45 menit setelah cleaner accept booking.

### Bisa minta cleaner cewek/cowok saja?
Bisa, di booking form pilih "Preferensi Gender".

### Apa yang dijaminkan asuransi?
Kerusakan barang sampai Rp 10 juta. Lihat T&C untuk detail klaim.

### Bagaimana kalau cleaner tidak datang?
Tap **Laporkan Masalah** di booking detail. Tim kami akan refund + cari cleaner pengganti.

## Pembayaran

### Metode pembayaran apa saja?
QRIS, Virtual Account (BCA, Mandiri, BNI, BRI, dll), e-wallet (OVO, DANA, ShopeePay).

### Kenapa tidak bisa transfer langsung ke cleaner?
Transaksi off-platform dilarang demi keamanan + kamu kehilangan asuransi & garansi.

## Cleaner Side

### Bagaimana cara jadi cleaner?
Daftar mode "Freelancer" → upload 3 dokumen KYC → tunggu approval admin (1-2 jam kerja) → online di Job Board.

### Berapa komisi cleaner?
- **Tanpa alat**: 40% flat
- **Bawa alat**:
  - Order < 300K → 60%
  - Order 300-600K → 55%
  - Order > 600K → 50%

### Berapa min penarikan saldo?
Rp 50.000.
$md$,
   'public', TRUE)
ON CONFLICT (slug) DO NOTHING;
