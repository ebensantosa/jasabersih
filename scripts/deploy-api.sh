#!/bin/bash
# Robust deploy script for jasabersih-api (npm workspaces monorepo).
# Binaries are hoisted to repo root node_modules/.bin/.

set -e

REPO_DIR=/var/www/jasabersih
API_DIR="$REPO_DIR/apps/api"

echo "==> [1/6] git pull"
cd "$REPO_DIR"
git pull --ff-only || { echo "FAIL: git pull"; exit 1; }

echo "==> [2/6] install all workspace deps (from repo root)"
cd "$REPO_DIR"
npm install --no-audit --no-fund 2>&1 | tail -10

echo "==> [3/6] ensure nest CLI in root node_modules"
if [ ! -x "$REPO_DIR/node_modules/.bin/nest" ]; then
  echo "    nest CLI missing — installing to repo root..."
  npm install --no-save --no-audit --no-fund @nestjs/cli typescript ts-node 2>&1 | tail -5
fi
if [ ! -x "$REPO_DIR/node_modules/.bin/nest" ]; then
  echo "FAIL: nest CLI still not found at $REPO_DIR/node_modules/.bin/nest"
  echo "Listing root node_modules/.bin/ entries containing 'nest':"
  ls "$REPO_DIR/node_modules/.bin/" 2>/dev/null | grep -i nest || echo "  (none)"
  exit 1
fi
echo "    OK: $($REPO_DIR/node_modules/.bin/nest --version 2>/dev/null || echo 'nest CLI ready')"

echo "==> [4/6] prisma generate"
cd "$API_DIR"
"$REPO_DIR/node_modules/.bin/prisma" generate 2>&1 | tail -5 || { echo "FAIL: prisma generate"; exit 1; }

echo "==> [5/6] build via root nest CLI"
cd "$API_DIR"
rm -rf dist
"$REPO_DIR/node_modules/.bin/nest" build || { echo "FAIL: nest build"; exit 1; }

if [ ! -f dist/main.js ]; then
  echo "FAIL: dist/main.js missing after build. Listing dist/:"
  find dist -type f -name "*.js" 2>/dev/null | head -20
  exit 1
fi
echo "    OK: dist/main.js exists ($(stat -c%s dist/main.js) bytes)"

echo "==> [6/6] restart pm2"
pm2 delete jasabersih-api 2>/dev/null || true
pm2 start "$REPO_DIR/ecosystem.config.js" --only jasabersih-api
pm2 save
sleep 2
pm2 logs jasabersih-api --lines 30 --nostream
echo ""
echo "==> DONE. Tail with: pm2 logs jasabersih-api"
