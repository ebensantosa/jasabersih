#!/usr/bin/env bash
# Deploy / redeploy JasaBersih on a provisioned VPS.
# Run AS ROOT. Assumes vps-provision.sh has already been run.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ebensantosa/jasabersih.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/jasabersih}"
ENV_DIR="${ENV_DIR:-/root/jasabersih-env}"

if [[ ! -f "${ENV_DIR}/api.env" || ! -f "${ENV_DIR}/admin.env" ]]; then
  echo "Env files are missing in ${ENV_DIR}. Upload api.env and admin.env first."
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
pnpm install --frozen-lockfile --prod=false

echo "==> [4/6] Prisma migrate + generate"
(cd apps/api && pnpm exec prisma generate && pnpm exec prisma migrate deploy)

echo "==> [5/6] Build api + admin"
pnpm --filter @jasabersih/api build
pnpm --filter @jasabersih/admin build

echo "==> [6/6] PM2 start/restart"
pm2 startOrReload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo ""
echo "Deploy selesai."
pm2 ls
