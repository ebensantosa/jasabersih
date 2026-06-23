#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/jasabersih"
HEALTH_API="http://127.0.0.1:5000/v1/health"
HEALTH_ADMIN="http://127.0.0.1:5001"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log()  { echo -e "${G}>${N} $*"; }
warn() { echo -e "${Y}!${N} $*"; }
die()  { echo -e "${R}x${N} $*" >&2; exit 1; }

cd "$APP_DIR" || die "App dir $APP_DIR not found."

PREV_SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
log "Current commit: ${PREV_SHA:0:7}"

log "git fetch + reset --hard origin/main + clean stray files"
git fetch origin --prune
git reset --hard origin/main
git clean -fdx -e node_modules -e .env -e .env.* -e apps/admin/.next -e apps/api/dist
NEW_SHA="$(git rev-parse HEAD)"
log "Deploying commit: ${NEW_SHA:0:7}"

log "pnpm install (root + workspaces, include devDependencies)"
CI=true pnpm install --frozen-lockfile --prod=false

log "Generate Prisma client"
(cd apps/api && pnpm exec prisma generate)

log "Apply Prisma migrations (deploy mode)"
(cd apps/api && pnpm exec prisma migrate deploy)

log "Seed master data (idempotent)"
(cd apps/api && pnpm exec tsx prisma/seed.ts) || warn "Seed skipped"

log "Build NestJS API"
(cd apps/api && rm -rf dist *.tsbuildinfo .tsbuildinfo && pnpm exec nest build)
[[ -f apps/api/dist/main.js ]] || die "API build did not produce dist/main.js"

log "Build Admin Next.js"
(cd apps/admin && rm -rf .next node_modules/.cache && pnpm exec next build)
[[ -d apps/admin/.next/server/app/admin ]] || die "Admin build did not produce .next/server/app/admin"

log "Kill any orphan listeners on :5000/:5001"
pm2 stop jasabersih-api jasabersih-admin 2>/dev/null || true
fuser -k 5000/tcp 2>/dev/null || sudo -n fuser -k 5000/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || sudo -n fuser -k 5001/tcp 2>/dev/null || true
sleep 2
if ss -tln 2>/dev/null | grep -qE ':(5000|5001)\b'; then
  warn "Port 5000/5001 still occupied after kill."
fi

log "pm2 start ecosystem.config.js (fresh)"
pm2 start "$APP_DIR/deploy/ecosystem.config.js" --update-env
pm2 save

log "Health checks"
sleep 3
api_ok=0; admin_ok=0
for i in 1 2 3 4 5; do
  curl -fsS --max-time 5 "$HEALTH_API" >/dev/null && api_ok=1 || true
  curl -fsS --max-time 5 "$HEALTH_ADMIN" >/dev/null && admin_ok=1 || true
  [[ $api_ok -eq 1 && $admin_ok -eq 1 ]] && break
  warn "Attempt $i - api=$api_ok admin=$admin_ok, retrying in 3s"
  sleep 3
done

if [[ $api_ok -eq 0 || $admin_ok -eq 0 ]]; then
  warn "Health check failed - rolling back to ${PREV_SHA:0:7}"
  if [[ -n "$PREV_SHA" ]]; then
    git reset --hard "$PREV_SHA"
    pnpm install --frozen-lockfile --prod=false
    (cd apps/api && pnpm exec prisma generate)
    (cd apps/api && rm -rf dist *.tsbuildinfo .tsbuildinfo && pnpm exec nest build)
    (cd apps/admin && rm -rf .next node_modules/.cache && pnpm exec next build)
    pm2 restart "$APP_DIR/deploy/ecosystem.config.js" --update-env
    pm2 save
    die "Rolled back to ${PREV_SHA:0:7}. Check pm2 logs jasabersih-api / jasabersih-admin."
  else
    die "No previous commit to roll back to. Manual intervention needed."
  fi
fi

log "Deploy ${NEW_SHA:0:7} live"
pm2 status
