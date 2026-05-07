# Cara Run JasaBersih

## TL;DR (3 perintah)

```powershell
# 1. Backend (Postgres + Redis + NestJS) — sekali setup
.\scripts\setup-backend.ps1

# 2. Backend dev server
npm run dev -w @jasabersih/api          # http://localhost:3000

# 3. Admin dashboard (di terminal lain)
npm run dev -w @jasabersih/admin        # http://localhost:3001

# 4. Mobile app (di terminal lain)
npm run start -w @jasabersih/mobile     # Expo
```

## Login credentials

### Admin (`http://localhost:3001/login`)
- `admin@jasabersih.com` / `admin123` — Super Admin
- `ops@jasabersih.com` / `ops123` — Ops Manager
- `cs@jasabersih.com` / `cs123` — CS Team

### Mobile (di-`/(auth)/login`)
- `customer@test.com` / `customer123` — Customer
- `cleaner@test.com` / `cleaner123` — Cleaner

## Mode operasi

App dirancang **graceful degradation** — semua app jalan walau backend offline:

| Backend status | Admin | Mobile |
|---|---|---|
| Running | Real API + Postgres | Real API |
| Offline | Mock data + dev creds | Zustand local + dev creds |

Badge **● LIVE API** (hijau) atau **● MOCK (offline)** (kuning) muncul di Bookings page admin untuk indikator.

## Backend prerequisite
- Docker Desktop (untuk Postgres + Redis)
- Node 20 LTS

## Backend endpoints sudah live

| Endpoint | Fungsi |
|---|---|
| `POST /v1/auth/admin-login` | Admin login |
| `POST /v1/auth/login` | User login (phone+password) |
| `POST /v1/auth/register` | Register OTP |
| `POST /v1/auth/verify-otp` | Verify + JWT |
| `POST /v1/auth/refresh` | Rotate JWT |
| `GET /v1/admin/bookings` | List semua orders |
| `GET /v1/admin/cleaners` | List cleaner + KYC status |
| `GET /v1/admin/users` | List customer |
| `PATCH /v1/admin/bookings/:id/assign` | Assign cleaner manual |
| `GET /v1/bookings` | Customer list bookings |
| `POST /v1/bookings` | Create booking |
| `POST /v1/bookings/:id/pay` | Pay → status searching |
| `POST /v1/bookings/:id/cancel` | Cancel |
| `GET /v1/health` | Health check |

Doc UI: `http://localhost:3000/docs` (Swagger)

## Belum live (Sprint 2-3 work)
- KYC upload + OCR (KTP, selfie)
- Wallet + Midtrans Iris withdrawal
- Real-time chat (Socket.io di `services/chat`)
- Push notifications (FCM)
- Cleaner geospatial matching (PostGIS)
- Voucher/referral CRUD
- Dispute resolution

Untuk demo sekarang, fitur-fitur ini pakai mock di mobile/admin.

## Stop semua
```powershell
npm run docker:down       # matikan Postgres + Redis
# Ctrl+C di setiap terminal dev
```
