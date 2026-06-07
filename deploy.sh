#!/bin/bash
# ============================================================
# Deploy script — pull + build + restart aman
# Usage di server: bash /var/www/jasabersih/deploy.sh
# ============================================================
set -e

REPO_DIR="/var/www/jasabersih"
cd "$REPO_DIR"

echo ""
echo "🚀 [1/5] Pull latest code..."
git pull --rebase=false

echo ""
echo "🧹 [2/5] Clean stale build cache..."
find apps/api -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete 2>/dev/null || true
rm -rf apps/api/dist

echo ""
echo "🔨 [3/5] Build API..."
cd apps/api
# nest build via global CLI (lebih reliable di prod)
if ! command -v nest >/dev/null 2>&1; then
  echo "   ⚠️  nest CLI not found, installing globally..."
  sudo npm install -g @nestjs/cli
fi
nest build
if [ ! -f dist/main.js ]; then
  echo "   ❌ Build gagal — dist/main.js tidak ada. ABORT."
  exit 1
fi
echo "   ✓ dist/main.js OK ($(stat -c%s dist/main.js) bytes)"

echo ""
echo "🔨 [4/5] Build Admin..."
cd "$REPO_DIR"
pnpm --filter @jasabersih/admin build
if [ ! -d apps/admin/.next ]; then
  echo "   ❌ Admin build gagal — .next tidak ada. ABORT (API tetap aman)."
  exit 1
fi
echo "   ✓ .next OK"

echo ""
echo "♻️  [5/5] Restart PM2 services..."
pm2 restart jasabersih-api jasabersih-admin --update-env
sleep 3

echo ""
echo "📊 Status:"
pm2 list

echo ""
echo "🔍 API health check..."
if curl -sf -o /dev/null --max-time 5 http://localhost:5000/docs; then
  echo "   ✓ API responding at :5000"
else
  echo "   ❌ API tidak respond! Cek log:"
  pm2 logs jasabersih-api --lines 10 --nostream
  exit 1
fi

echo ""
echo "✅ Deploy selesai."
