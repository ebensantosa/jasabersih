#!/usr/bin/env bash
# Deploy / update JasaBersih di VPS
# Run dari root repo: bash deploy/deploy.sh

set -e
cd "$(dirname "$0")/.."

echo "==> Pull latest dari Git..."
git pull origin main

echo "==> Install dependencies..."
npm install --omit=dev --legacy-peer-deps

# Re-install dev deps yang perlu untuk build (typescript, prisma, next CLI)
npm install --include=dev --legacy-peer-deps

echo "==> Generate Prisma client..."
npm run db:generate -w @jasabersih/api 2>/dev/null || (cd apps/api && npx prisma generate)

echo "==> Run database migrations..."
(cd apps/api && npx prisma migrate deploy)

echo "==> Seed master data (services, admin users)..."
(cd apps/api && npx tsx prisma/seed.ts) || echo "Seed skipped (idempotent)"

echo "==> Build NestJS API..."
# Clean tsbuildinfo cache + dist agar tsc tidak skip emit (incremental cache bug)
(cd apps/api && rm -rf dist *.tsbuildinfo .tsbuildinfo && npx nest build)

echo "==> Build Admin Next.js..."
(cd apps/admin && npx next build)

echo "==> (Re)start PM2 processes..."
pm2 reload deploy/ecosystem.config.js --update-env || pm2 start deploy/ecosystem.config.js
pm2 save

echo ""
echo "================================================"
echo "  DEPLOY SELESAI"
echo "================================================"
pm2 status
echo ""
echo "Logs: pm2 logs"
echo "Stop: pm2 stop all"
