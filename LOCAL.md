# Local Setup (Tanpa Docker)

Native install di Windows. Untuk dev only.

## Prerequisites

| Tool | Download | Catatan |
|---|---|---|
| Node 20 LTS | https://nodejs.org | Pilih versi LTS |
| PostgreSQL 16 | https://www.postgresql.org/download/windows/ | Centang **PostGIS** di Stack Builder pas install |
| Memurai (Redis Windows) | https://www.memurai.com/get-memurai | Free Developer Edition. Atau pakai WSL2 + Redis |

---

## Step 1 — Install Postgres + PostGIS

1. Download installer dari postgresql.org
2. Saat install:
   - Set password **postgres** (catat — diperlukan nanti)
   - Default port `5432`
   - Centang **Stack Builder** di akhir install
3. Stack Builder muka → pilih **PostGIS Bundle for Postgres 16** → install
4. Verify: buka Command Prompt:
   ```cmd
   psql -U postgres -c "SELECT version();"
   ```

## Step 2 — Bikin database & extension

```cmd
psql -U postgres
```

Di prompt psql:
```sql
CREATE USER jasabersih WITH PASSWORD 'jasabersih123';
CREATE DATABASE jasabersih OWNER jasabersih;
\c jasabersih
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
\q
```

## Step 3 — Install Memurai (Redis Windows)

1. Download dari memurai.com
2. Install pakai default settings (port 6379)
3. Verify: `memurai-cli ping` → harus return `PONG`

> Alternatif: pakai WSL2 dengan `sudo apt install redis-server && sudo service redis-server start`

## Step 4 — Setup .env API

```powershell
cd d:\JasaBersih.com\jasabersih
copy apps\api\.env.example apps\api\.env
```

Edit `apps/api/.env`:
```env
DATABASE_URL=postgresql://jasabersih:jasabersih123@localhost:5432/jasabersih?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=ganti-dengan-random-min-32-char
JWT_REFRESH_SECRET=ganti-dengan-random-min-32-char-beda
```

Generate JWT secrets random di PowerShell:
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

## Step 5 — Migrate + seed

```powershell
cd d:\JasaBersih.com\jasabersih\apps\api
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

## Step 6 — Run

3 terminal terpisah:

**Terminal 1 — API:**
```powershell
cd d:\JasaBersih.com\jasabersih
npm run dev -w @jasabersih/api
```
→ http://localhost:3000 (docs di /docs)

**Terminal 2 — Admin:**
```powershell
npm run dev -w @jasabersih/admin
```
→ http://localhost:3001 (login: `admin@jasabersih.com` / `admin123`)

**Terminal 3 — Mobile:**
```powershell
npm run start -w @jasabersih/mobile
```
→ Expo dev tools, pencet `w` untuk web atau scan QR di HP

## Step 7 — Mobile pointing ke API local

Edit `apps/mobile/app.json`, tambah di section `expo`:
```json
"extra": {
  "apiBaseUrl": "http://localhost:3000/v1",
  "eas": { "projectId": "..." }
}
```

> Untuk Android emulator: `http://10.0.2.2:3000/v1` (10.0.2.2 = host machine dari emu)
> Untuk HP fisik di WiFi sama: `http://<IP_LAPTOP>:3000/v1` — cek IP via `ipconfig`

Restart Expo.

---

## Troubleshooting

**`psql: command not found`** → tambah `C:\Program Files\PostgreSQL\16\bin` ke PATH Windows

**Postgres extension error `postgis not found`** → install PostGIS Bundle via Stack Builder. Atau download installer terpisah dari https://download.osgeo.org/postgis/windows/

**Memurai conflict port 6379** → pastikan gak ada Redis lain jalan. Stop service: `Stop-Service Memurai`

**Prisma migrate error `password authentication failed`** → cek `DATABASE_URL` di `.env`, password user `jasabersih` harus match yang di-CREATE

**Port 3000/3001 sudah dipakai** → kill node:
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Stop semua

- API/Admin: Ctrl+C di terminal masing-masing
- Postgres: `services.msc` → cari "postgresql-x64-16" → Stop (atau biarkan running)
- Memurai: `Stop-Service Memurai`
