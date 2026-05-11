#!/usr/bin/env bash
# ===========================================================================
# JasaBersih deploy script — runs on the VPS, called by GitHub Actions.
# Idempotent: every run does pull → install → build → migrate → reload.
#
# Run as the deploy user, NOT root:
#   bash /var/www/jasabersih/deploy/deploy.sh
# ===========================================================================
set -euo pipefail

APP_DIR="/var/www/jasabersih"
HEALTH_API="http://127.0.0.1:5000/v1/health"
HEALTH_ADMIN="http://127.0.0.1:5001"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log()  { echo -e "${G}▶${N} $*"; }
warn() { echo -e "${Y}⚠${N} $*"; }
die()  { echo -e "${R}✗${N} $*" >&2; exit 1; }

cd "$APP_DIR" || die "App dir $APP_DIR not found — run setup-vps.sh first."

PREV_SHA="$(git rev-parse HEAD 2>/dev/null || echo '')"
log "Current commit: ${PREV_SHA:0:7}"

# 1. Pull latest -----------------------------------------------------------
log "git fetch + reset --hard origin/main"
git fetch origin --prune
git reset --hard origin/main
NEW_SHA="$(git rev-parse HEAD)"
log "Deploying commit: ${NEW_SHA:0:7}"

# 2. Install deps (include dev so nest CLI / tsc / prisma are available) ---
log "npm install (root + workspaces)…"
npm install --no-audit --no-fund --include=dev --legacy-peer-deps

# 3. Prisma generate + migrate --------------------------------------------
log "Generate Prisma client…"
(cd apps/api && npx prisma generate)

log "Apply Prisma migrations (deploy mode)…"
(cd apps/api && npx prisma migrate deploy)

log "Seed master data (idempotent)…"
(cd apps/api && npx tsx prisma/seed.ts) || warn "Seed skipped"

# 4. Build API ------------------------------------------------------------
# Clean tsbuildinfo cache + dist so tsc actually emits (incremental cache bug).
log "Build NestJS API…"
(cd apps/api && rm -rf dist *.tsbuildinfo .tsbuildinfo && npx nest build)
[[ -f apps/api/dist/main.js ]] || die "API build did not produce dist/main.js"

# 5. Build Admin ----------------------------------------------------------
# Wipe BOTH .next and node_modules/.cache so Next can't reuse stale workspace package output.
log "Build Admin Next.js…"
(cd apps/admin && rm -rf .next node_modules/.cache && npx next build)
[[ -d apps/admin/.next/server/app/admin ]] || die "Admin build did not produce .next/server/app/admin"

# 6. Restart pm2 (FULL restart, not reload — reload doesn't always reload Next's loaded chunks)
log "pm2 restart (force fresh process)"
pm2 restart "$APP_DIR/deploy/ecosystem.config.js" --update-env \
  || pm2 start "$APP_DIR/deploy/ecosystem.config.js"
pm2 save

# 7. Health check + auto-rollback -----------------------------------------
log "Health checks…"
sleep 3
api_ok=0; admin_ok=0
for i in 1 2 3 4 5; do
  curl -fsS --max-time 5 "$HEALTH_API"   >/dev/null && api_ok=1   || true
  curl -fsS --max-time 5 "$HEALTH_ADMIN" >/dev/null && admin_ok=1 || true
  [[ $api_ok -eq 1 && $admin_ok -eq 1 ]] && break
  warn "Attempt $i — api=$api_ok admin=$admin_ok, retrying in 3s…"
  sleep 3
done

if [[ $api_ok -eq 0 || $admin_ok -eq 0 ]]; then
  warn "Health check failed — rolling back to ${PREV_SHA:0:7}"
  if [[ -n "$PREV_SHA" ]]; then
    git reset --hard "$PREV_SHA"
    npm install --no-audit --no-fund --include=dev --legacy-peer-deps
    (cd apps/api && npx prisma generate)
    (cd apps/api && rm -rf dist *.tsbuildinfo .tsbuildinfo && npx nest build)
    (cd apps/admin && rm -rf .next node_modules/.cache && npx next build)
    pm2 restart "$APP_DIR/deploy/ecosystem.config.js" --update-env
    pm2 save
    die "Rolled back to ${PREV_SHA:0:7}. Check pm2 logs jasabersih-api / jasabersih-admin."
  else
    die "No previous commit to roll back to. Manual intervention needed."
  fi
fi

log "Deploy ${NEW_SHA:0:7} live (api ✓ admin ✓)"
pm2 status
