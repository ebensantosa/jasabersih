# Disaster Recovery — Pindah VPS

Runbook lengkap kalau VPS lama crash / mau migrasi. Target: app jalan lagi di VPS baru dalam **~30–45 menit**.

## Prasyarat (siapkan SEKARANG, sebelum disaster)

1. **Backup harian PostgreSQL** sudah jalan ke Cloudflare R2 — lihat setup di bawah.
2. **`.env` files** disimpan di password manager (1Password / Bitwarden):
   - `api.env` (isi: `apps/api/.env` lengkap — DB creds, JWT secret, R2 keys, Midtrans keys, dll)
   - `admin.env` (isi: `apps/admin/.env.local` — minimal API_BASE_URL)
   - `backup.env` (kredensial R2 + DB untuk script backup)
3. **DNS pakai Cloudflare** dengan TTL ≤ 5 menit — biar switch IP cepet.
4. **R2 bucket** dengan lifecycle rule: delete object di `/db/` setelah 14 hari (hemat storage).

## Setup awal di VPS production (sekali aja)

```bash
# di VPS production
mkdir -p /root/jasabersih-env

# upload api.env, admin.env, backup.env ke /root/jasabersih-env/
# (pakai scp dari laptop, atau paste manual via nano)

# install awscli buat upload backup ke R2
apt-get install -y awscli
source /root/jasabersih-env/backup.env
aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID" --profile r2
aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY" --profile r2
aws configure set region auto --profile r2

# pasang cron backup harian jam 02:00 UTC
chmod +x /var/www/jasabersih/scripts/db-backup.sh
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/jasabersih/scripts/db-backup.sh >> /var/log/jasabersih-backup.log 2>&1") | crontab -

# tes manual
bash /var/www/jasabersih/scripts/db-backup.sh
```

## Skenario: VPS lama mati, migrasi ke VPS baru

### Step 1 — Sewa VPS baru (Ubuntu 22.04/24.04, min 2GB RAM)
Catat IP publiknya.

### Step 2 — Update DNS
Di Cloudflare, ubah A record `api.jasabersih.com` dan `dashboard.jasabersih.com` ke IP baru. Propagate ≤ 5 menit kalau TTL low.

### Step 3 — Provision VPS baru
```bash
# SSH ke VPS baru sebagai root
ssh root@<ip-baru>

# download script provision
wget https://raw.githubusercontent.com/ebensantosa/jasabersih/main/scripts/vps-provision.sh
bash vps-provision.sh
```

Script ini install: Node 20, PostgreSQL 16 + PostGIS, nginx, PM2, certbot, firewall.

### Step 4 — Buat user DB + database
```bash
sudo -u postgres psql <<EOF
CREATE USER jasabersih WITH PASSWORD 'GANTI_SAMA_KAYA_DI_API_ENV';
CREATE DATABASE jasabersih OWNER jasabersih;
\c jasabersih
CREATE EXTENSION postgis;
EOF
```

Password **harus sama** dengan yang ada di `api.env` (field `DATABASE_URL`).

### Step 5 — Upload env files
Dari laptop:
```bash
scp api.env admin.env backup.env root@<ip-baru>:/root/jasabersih-env/
```

### Step 6 — Deploy app
```bash
ssh root@<ip-baru>
mkdir -p /var/log/pm2
wget -O /tmp/vps-deploy.sh https://raw.githubusercontent.com/ebensantosa/jasabersih/main/scripts/vps-deploy.sh
REPO_URL=https://github.com/ebensantosa/jasabersih.git BRANCH=main bash /tmp/vps-deploy.sh
```

Ini: clone repo, install deps, prisma migrate, build api + admin, pm2 start.

### Step 7 — Restore database dari backup
```bash
cd /var/www/jasabersih
chmod +x scripts/db-restore.sh
bash scripts/db-restore.sh
# pilih backup terbaru, ketik 'yes' untuk konfirmasi
```

### Step 8 — SSL cert (kalau certbot gagal di step 3)
```bash
certbot --nginx -d api.jasabersih.com -d dashboard.jasabersih.com
```

### Step 9 — Test
```bash
curl https://api.jasabersih.com/v1/health
# {"ok":true}
```

Buka https://dashboard.jasabersih.com — login admin, cek bookings tampil.

### Step 10 — Setup ulang backup cron di VPS baru
```bash
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/jasabersih/scripts/db-backup.sh >> /var/log/jasabersih-backup.log 2>&1") | crontab -
```

## Yang TIDAK perlu di-migrasi

- **Cloudflare R2** (foto user/cleaner) — aman, storage external.
- **Mobile app users** — gak perlu rebuild APK. App pakai `apiBaseUrl` di-config build-time, dan domain tetep sama.
- **Expo push tokens** — tersimpan di DB, ikut ter-restore.

## Yang perlu diperhatiin

- **JWT_ACCESS_SECRET / JWT_REFRESH_SECRET** harus SAMA persis dengan VPS lama, kalau gak semua user logged out.
- **R2 credentials** harus sama, kalau gak foto-foto lama gak bisa diakses.
- **Database URL** di `api.env` harus match dengan password yang kamu set di Step 4.

## Rolling redeploy (bukan disaster, cuma push update)

Cukup di VPS production:
```bash
cd /var/www/jasabersih
git pull
npm install   # kalau ada dependency baru
(cd apps/api && npx prisma migrate deploy)
npm run build -w @jasabersih/api && pm2 restart jasabersih-api
npm run build -w @jasabersih/admin && pm2 restart jasabersih-admin
```
