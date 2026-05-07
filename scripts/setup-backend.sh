#!/usr/bin/env bash
# JasaBersih backend setup — Linux/WSL/Mac
# Usage: bash scripts/setup-backend.sh

set -e
cd "$(dirname "$0")/.."

echo "[1/5] Bring up Docker (Postgres + Redis + MinIO)..."
docker compose -f docker/docker-compose.dev.yml up -d
sleep 5

echo "[2/5] Setup .env API kalau belum..."
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  ACCESS=$(openssl rand -base64 48 | tr -d '\n')
  REFRESH=$(openssl rand -base64 48 | tr -d '\n')
  # macOS sed butuh '' setelah -i; Linux gak. Pakai temp file untuk portability.
  sed -i.bak "s|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${ACCESS}|" apps/api/.env
  sed -i.bak "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${REFRESH}|" apps/api/.env
  rm -f apps/api/.env.bak
  echo "    .env dibuat dengan random JWT secrets."
fi

echo "[3/5] Generate Prisma client..."
(cd apps/api && npx prisma generate)

echo "[4/5] Apply migrations..."
(cd apps/api && npx prisma migrate deploy)

echo "[5/5] Seed admin users + services..."
(cd apps/api && npx tsx prisma/seed.ts)

echo ""
echo "================================================"
echo "  DONE"
echo "================================================"
echo ""
echo "Run di terminal terpisah:"
echo "  npm run dev -w @jasabersih/api      # http://localhost:3000"
echo "  npm run dev -w @jasabersih/admin    # http://localhost:3001"
echo "  npm run start -w @jasabersih/mobile # Expo"
echo ""
echo "Admin login: admin@jasabersih.com / admin123"
