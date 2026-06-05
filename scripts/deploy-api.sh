#!/bin/bash
# Robust deploy script for jasabersih-api.
# Handles: pull, dep install (incl dev), build, verify, pm2 restart.
# Bail loudly on each failure so you see WHERE it broke.

set -e

REPO_DIR=/var/www/jasabersih
API_DIR="$REPO_DIR/apps/api"

echo "==> [1/6] git pull"
cd "$REPO_DIR"
git pull --ff-only || { echo "FAIL: git pull"; exit 1; }

echo "==> [2/6] install runtime deps"
cd "$API_DIR"
npm install --no-audit --no-fund 2>&1 | tail -10

echo "==> [3/6] ensure nest CLI + typescript present"
# Force-install build tools needed by `nest build` even if devDependencies were pruned.
npm install --no-save --no-audit --no-fund @nestjs/cli typescript ts-node 2>&1 | tail -5

echo "==> [4/6] prisma generate"
npx prisma generate 2>&1 | tail -5 || { echo "FAIL: prisma generate"; exit 1; }

echo "==> [5/6] build"
rm -rf dist
./node_modules/.bin/nest build || { echo "FAIL: nest build"; exit 1; }

if [ ! -f dist/main.js ]; then
  echo "FAIL: dist/main.js missing after build. Listing dist/:"
  find dist -type f -name "*.js" 2>/dev/null | head -20
  exit 1
fi
echo "OK: dist/main.js exists ($(stat -c%s dist/main.js) bytes)"

echo "==> [6/6] restart pm2"
pm2 delete jasabersih-api 2>/dev/null || true
pm2 start "$REPO_DIR/ecosystem.config.js" --only jasabersih-api
pm2 save
sleep 2
pm2 logs jasabersih-api --lines 20 --nostream
echo ""
echo "==> DONE. Run 'pm2 logs jasabersih-api' to tail live."
