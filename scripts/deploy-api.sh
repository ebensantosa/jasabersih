#!/bin/bash
# Robust deploy script for jasabersih-api in a pnpm workspace monorepo.

set -e

REPO_DIR=/var/www/jasabersih
API_DIR="$REPO_DIR/apps/api"

echo "==> [1/6] git pull"
cd "$REPO_DIR"
git pull --ff-only || { echo "FAIL: git pull"; exit 1; }

echo "==> [2/6] install all workspace deps (include devDependencies)"
cd "$REPO_DIR"
pnpm install --frozen-lockfile --prod=false 2>&1 | tail -20

echo "==> [3/6] ensure workspace CLIs available"
command -v pnpm >/dev/null 2>&1 || { echo "FAIL: pnpm not installed"; exit 1; }
cd "$API_DIR"
pnpm exec nest --version >/dev/null 2>&1 || { echo "FAIL: nest CLI unavailable after install"; exit 1; }
pnpm exec prisma --version >/dev/null 2>&1 || { echo "FAIL: prisma CLI unavailable after install"; exit 1; }
echo "    OK: workspace CLIs ready"

echo "==> [4/6] prisma generate"
cd "$API_DIR"
pnpm exec prisma generate 2>&1 | tail -10 || { echo "FAIL: prisma generate"; exit 1; }

echo "==> [5/6] build api"
cd "$API_DIR"
rm -rf dist tsconfig.tsbuildinfo .tsbuildinfo
pnpm exec nest build || { echo "FAIL: nest build"; exit 1; }

if [ ! -f dist/main.js ]; then
  echo "FAIL: dist/main.js missing after build. Listing dist/:"
  find dist -type f -name "*.js" 2>/dev/null | head -20
  exit 1
fi
echo "    OK: dist/main.js exists ($(stat -c%s dist/main.js) bytes)"

echo "==> [6/6] restart pm2"
pm2 delete jasabersih-api 2>/dev/null || true
pm2 start "$REPO_DIR/ecosystem.config.js" --only jasabersih-api --update-env
pm2 save
sleep 2
pm2 logs jasabersih-api --lines 30 --nostream
echo ""
echo "==> DONE. Tail with: pm2 logs jasabersih-api"
