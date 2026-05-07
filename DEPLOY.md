# Deploy JasaBersih ke VPS

Tanpa Docker. Native install di Ubuntu 22.04+ / Debian 12. Kode di-pull dari GitHub.

## Prerequisites

- VPS Ubuntu 22.04+ atau Debian 12 (min 2 vCPU, 2GB RAM, 20GB SSD)
- Domain pointed ke IP VPS:
  - `api.jasabersih.com` → VPS IP
  - `dashboard.jasabersih.com` → VPS IP
- Repo GitHub: `https://github.com/<owner>/jasabersih`
- Akses root SSH ke VPS

---

## Step 1 — One-shot setup VPS (sekali aja)

SSH ke VPS sebagai root:

```bash
ssh root@<VPS_IP>
```

Download & jalankan setup script:

```bash
curl -sSL https://raw.githubusercontent.com/<owner>/jasabersih/main/deploy/setup-vps.sh | \
  DOMAIN_API=api.jasabersih.com \
  DOMAIN_ADMIN=dashboard.jasabersih.com \
  bash
```

Script akan install: **Node 20, PostgreSQL 16 + PostGIS, Redis, Caddy, PM2**, bikin user `deploy`, setup database `jasabersih`, configure firewall (UFW), dan tulis Caddyfile auto-SSL.

> **DNS harus sudah pointing ke VPS sebelum lanjut**, karena Caddy butuh resolve domain untuk issue SSL Let's Encrypt.

---

## Step 2 — Clone repo & pasang env

Login sebagai user `deploy`:

```bash
su - deploy
cd /var/www
git clone https://github.com/<owner>/jasabersih.git
cd jasabersih
```

Copy & edit env files:

```bash
cp deploy/env.api.example apps/api/.env
cp deploy/env.admin.example apps/admin/.env.local

# Generate JWT secrets random
openssl rand -base64 64    # → copy ke JWT_ACCESS_SECRET
openssl rand -base64 64    # → copy ke JWT_REFRESH_SECRET (BEDA dari access)

nano apps/api/.env         # ganti GANTI_PASSWORD ke password Postgres
nano apps/admin/.env.local # cek NEXT_PUBLIC_API_BASE_URL = https://api.jasabersih.com/v1
```

Update password Postgres (dari `CHANGE_ME_IN_ENV`):

```bash
sudo -u postgres psql -c "ALTER USER jasabersih WITH PASSWORD 'PASSWORD_BARU_KAMU';"
```

Pastikan `DATABASE_URL` di `apps/api/.env` pakai password yang sama.

Bikin folder log:

```bash
sudo mkdir -p /var/log/jasabersih
sudo chown deploy:deploy /var/log/jasabersih
```

---

## Step 3 — Deploy pertama kali

```bash
cd /var/www/jasabersih
bash deploy/deploy.sh
```

Script akan: `git pull`, `npm install`, `prisma generate`, `prisma migrate deploy`, seed admin users + services catalog, build NestJS + Next.js, start PM2.

Cek status:

```bash
pm2 status
pm2 logs            # streaming log
pm2 logs --lines 50 # 50 baris terakhir
```

Setup PM2 auto-start saat reboot:

```bash
pm2 startup systemd  # ikuti instruksi yang muncul
pm2 save
```

---

## Step 4 — Setup auto-deploy via GitHub Actions

Di **GitHub repo Settings → Secrets and variables → Actions**, tambah:

| Secret | Value |
|---|---|
| `VPS_HOST` | IP VPS atau domain (mis. `123.45.67.89`) |
| `VPS_USER` | `deploy` |
| `VPS_PORT` | `22` (skip kalau pakai port standard) |
| `VPS_SSH_KEY` | Isi private key (`~/.ssh/id_ed25519`) — generate dulu di lokal |

Generate SSH key di laptop kalau belum:
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
# copy public key ke VPS:
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@<VPS_IP>
# isi private key (~/.ssh/id_ed25519) ke GitHub Secret VPS_SSH_KEY
```

Setelah secrets di-set, tiap push ke `main` akan auto-deploy via workflow `.github/workflows/deploy.yml`.

Manual trigger: **GitHub → Actions tab → Deploy to VPS → Run workflow**.

---

## Step 5 — Verify

- `https://api.jasabersih.com/v1/health` → `{"status":"ok","db":true,"redis":true}`
- `https://api.jasabersih.com/docs` → Swagger UI
- `https://dashboard.jasabersih.com/login` → admin login
- Login: `admin@jasabersih.com` / `admin123` → **GANTI password segera**:
  ```sql
  -- di psql
  UPDATE admin_users SET password_hash = crypt('PASSWORD_BARU', gen_salt('bf')) WHERE email = 'admin@jasabersih.com';
  ```

---

## Update / redeploy

Otomatis: push ke `main` → GitHub Actions deploy.

Manual SSH:
```bash
ssh deploy@<VPS_IP>
cd /var/www/jasabersih
bash deploy/deploy.sh
```

---

## Rollback

```bash
ssh deploy@<VPS_IP>
cd /var/www/jasabersih
git log --oneline -10        # cari commit yang stable
git checkout <commit-hash>
bash deploy/deploy.sh
```

Atau revert commit di GitHub → push → auto-deploy.

---

## Backup database (recommended setup cron)

```bash
sudo crontab -e
```

Tambah line (backup tiap 3 jam):
```cron
0 */3 * * * sudo -u postgres pg_dump jasabersih | gzip > /var/backups/jasabersih-$(date +\%Y\%m\%d-\%H).sql.gz && find /var/backups -name 'jasabersih-*.sql.gz' -mtime +7 -delete
```

Restore:
```bash
gunzip < /var/backups/jasabersih-20260507-09.sql.gz | sudo -u postgres psql jasabersih
```

---

## Mobile APK

Mobile (Expo React Native) tidak deploy ke VPS — build APK/AAB dengan EAS:

```bash
# di laptop, dari /apps/mobile
npm install -g eas-cli
eas login
eas build -p android --profile production
```

Set di `app.json` extra:
```json
"extra": {
  "apiBaseUrl": "https://api.jasabersih.com/v1"
}
```

Upload APK ke Google Play Console.

---

## Troubleshooting

**Caddy gagal issue SSL** → cek DNS sudah propagate (`dig api.jasabersih.com`), pastikan port 80+443 open

**Postgres "FATAL: password authentication failed"** → password di `apps/api/.env` beda dengan yang di-set via `ALTER USER`

**PM2 process keep restarting** → `pm2 logs jasabersih-api` lihat error. Biasanya: env var hilang, port conflict, atau migration gagal

**Build out of memory** → upgrade VPS ke 2GB+ RAM, atau pasang swap:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Update Node** → `sudo apt-get install nodejs` setelah node 20 keluar versi baru, lalu `bash deploy/deploy.sh`

---

## File reference

| File | Fungsi |
|---|---|
| `deploy/setup-vps.sh` | One-shot install Node+PG+Redis+Caddy+PM2 di Ubuntu |
| `deploy/deploy.sh` | Pull + install + build + restart PM2 (idempotent, bisa di-run berkali-kali) |
| `deploy/ecosystem.config.js` | PM2 config — keep API + Admin running 24/7 |
| `deploy/env.api.example` | Template env API NestJS |
| `deploy/env.admin.example` | Template env Admin Next.js |
| `.github/workflows/deploy.yml` | GitHub Actions auto-deploy on push to main |
| `/etc/caddy/Caddyfile` | (di-VPS) reverse proxy + SSL Let's Encrypt |
