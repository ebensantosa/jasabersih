#!/usr/bin/env bash
# JasaBersih VPS one-shot setup — Ubuntu 22.04+ (atau Debian 12)
# Install: Node 20, PostgreSQL 16 + PostGIS, Redis, Caddy, PM2, build-essentials
# Usage: curl -sSL https://raw.githubusercontent.com/<owner>/jasabersih/main/deploy/setup-vps.sh | sudo bash

set -e

# ===== Args =====
DOMAIN_API="${DOMAIN_API:-api.jasabersih.com}"
DOMAIN_ADMIN="${DOMAIN_ADMIN:-dashboard.jasabersih.com}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="/var/www/jasabersih"

echo "==> JasaBersih VPS Setup"
echo "  API domain:     $DOMAIN_API"
echo "  Admin domain:   $DOMAIN_ADMIN"
echo "  Deploy user:    $DEPLOY_USER"
echo "  App directory:  $APP_DIR"
echo ""
sleep 2

if [[ $EUID -ne 0 ]]; then
  echo "Run sebagai root (sudo bash setup-vps.sh)"
  exit 1
fi

# ===== Update + base =====
echo "[1/8] Update apt + install base packages..."
apt-get update -y
apt-get install -y curl git build-essential ca-certificates gnupg lsb-release ufw

# ===== Node 20 LTS via NodeSource =====
echo "[2/8] Install Node 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ===== PostgreSQL 16 + PostGIS =====
echo "[3/8] Install PostgreSQL 16 + PostGIS..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt-get update -y
apt-get install -y postgresql-16 postgresql-16-postgis-3 postgresql-contrib-16
systemctl enable --now postgresql

# ===== Redis =====
echo "[4/8] Install Redis..."
apt-get install -y redis-server
systemctl enable --now redis-server

# ===== Caddy (auto-SSL reverse proxy) =====
echo "[5/8] Install Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# ===== PM2 + pnpm helper =====
echo "[6/8] Install PM2..."
npm install -g pm2

# ===== Deploy user =====
echo "[7/8] Setup deploy user..."
if ! id -u "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
fi
mkdir -p "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

# ===== Database setup =====
echo "[8/8] Setup PostgreSQL database..."
sudo -u postgres psql <<EOF
CREATE USER jasabersih WITH PASSWORD 'CHANGE_ME_IN_ENV';
CREATE DATABASE jasabersih OWNER jasabersih;
\c jasabersih
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
GRANT ALL PRIVILEGES ON DATABASE jasabersih TO jasabersih;
EOF

# ===== Firewall =====
echo "==> Configure firewall (allow SSH + HTTP + HTTPS)..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ===== Caddy config =====
echo "==> Write Caddyfile..."
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN_API {
    reverse_proxy localhost:3000
    encode gzip
}

$DOMAIN_ADMIN {
    reverse_proxy localhost:3001
    encode gzip
}
EOF
systemctl reload caddy

echo ""
echo "================================================"
echo "  SETUP SELESAI"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Login sebagai $DEPLOY_USER:"
echo "     su - $DEPLOY_USER"
echo "  2. Clone repo ke $APP_DIR:"
echo "     cd /var/www && git clone https://github.com/<owner>/jasabersih.git"
echo "  3. Setup env + run deploy:"
echo "     cd $APP_DIR && bash deploy/deploy.sh"
echo ""
echo "  IMPORTANT: ganti password Postgres di apps/api/.env"
echo "             (sekarang: 'CHANGE_ME_IN_ENV')"
echo ""
echo "  DNS: arahkan $DOMAIN_API & $DOMAIN_ADMIN ke IP VPS ini."
echo "       Caddy auto-issue SSL Let's Encrypt setelah DNS resolve."
