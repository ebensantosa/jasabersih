#!/usr/bin/env bash
# Provision a fresh Ubuntu 22.04/24.04 VPS for JasaBersih.
# Run AS ROOT on a clean VPS. Idempotent — safe to re-run.
# Usage: bash vps-provision.sh

set -euo pipefail

DOMAIN_API="${DOMAIN_API:-api.jasabersih.com}"
DOMAIN_ADMIN="${DOMAIN_ADMIN:-dashboard.jasabersih.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-ebensantosa9@gmail.com}"
NODE_MAJOR="${NODE_MAJOR:-20}"
PG_VERSION="${PG_VERSION:-16}"

echo "==> [1/8] System update"
apt-get update -y
apt-get upgrade -y

echo "==> [2/8] Base packages"
apt-get install -y curl git build-essential ca-certificates gnupg ufw nginx certbot python3-certbot-nginx unzip jq

echo "==> [3/8] Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> [4/8] PostgreSQL ${PG_VERSION} + PostGIS"
if ! command -v psql >/dev/null; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-${PG_VERSION} postgresql-${PG_VERSION}-postgis-3
fi
systemctl enable --now postgresql

echo "==> [5/8] Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> [6/8] Nginx site configs"
cat > /etc/nginx/sites-available/jasabersih-api <<EOF
server {
  listen 80;
  server_name ${DOMAIN_API};
  client_max_body_size 25m;
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
  }
}
EOF

cat > /etc/nginx/sites-available/jasabersih-admin <<EOF
server {
  listen 80;
  server_name ${DOMAIN_ADMIN};
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

ln -sf /etc/nginx/sites-available/jasabersih-api /etc/nginx/sites-enabled/jasabersih-api
ln -sf /etc/nginx/sites-available/jasabersih-admin /etc/nginx/sites-enabled/jasabersih-admin
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [7/8] SSL certs (certbot)"
certbot --nginx --non-interactive --agree-tos -m "${ADMIN_EMAIL}" \
  -d "${DOMAIN_API}" -d "${DOMAIN_ADMIN}" || echo "    (skip — DNS belum arah ke server? jalankan certbot manual nanti)"

echo "==> [8/8] PM2 startup hook"
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo ""
echo "✓ Provision selesai."
echo "  Berikutnya:"
echo "    1) Set password Postgres + buat DB:"
echo "         sudo -u postgres psql"
echo "         CREATE USER jasabersih WITH PASSWORD 'GANTI_INI';"
echo "         CREATE DATABASE jasabersih OWNER jasabersih;"
echo "         \\c jasabersih"
echo "         CREATE EXTENSION postgis;"
echo "    2) Jalankan: bash vps-deploy.sh"
