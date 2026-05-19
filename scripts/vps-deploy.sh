#!/usr/bin/env bash
# Deploy / redeploy JasaBersih on a provisioned VPS.
# Run AS ROOT. Assumes vps-provision.sh sudah dijalankan dan Postgres siap.
# Usage:
#   REPO_URL=https://github.com/ebensantosa/jasabersih.git BRANCH=main bash vps-deploy.sh
#
# .env files harus sudah disiapkan di /root/jasabersih-env/ sebelum jalanin:
#   /root/jasabersih-env/api.env     -> di-copy ke apps/api/.env
#   /root/jasabersih-env/admin.env   -> di-copy ke apps/admin/.env.local

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ebensantosa/jasabersih.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/jasabersih}"
ENV_DIR="${ENV_DIR:-/root/jasabersih-env}"

if [[ ! -f "${ENV_DIR}/api.env" || ! -f "${ENV_DIR}/admin.env" ]]; then
  echo "❌ Env files belum ada di ${ENV_DIR}. Upload api.env & admin.env dulu (dari backup / password manager)."
  exit 1
fi

echo "==> [1/6] Clone / pull repo"
if [[ -d "${APP_DIR}/.git" ]]; then
  cd "${APP_DIR}" && git fetch && git checkout "${BRANCH}" && git pull
else
  mkdir -p "$(dirname "${APP_DIR}")"
  git clone -b "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "==> [2/6] Copy env files"
cp "${ENV_DIR}/api.env" apps/api/.env
cp "${ENV_DIR}/admin.env" apps/admin/.env.local

echo "==> [3/6] Install dependencies"
npm install

echo "==> [4/6] Prisma migrate + generate"
(cd apps/api && npx prisma generate && npx prisma migrate deploy)

echo "==> [5/6] Build api + admin"
npm run build -w @jasabersih/api
npm run build -w @jasabersih/admin

echo "==> [6/6] PM2 start/restart"
pm2 startOrReload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "✓ Deploy selesai."
pm2 ls
