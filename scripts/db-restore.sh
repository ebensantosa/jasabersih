#!/usr/bin/env bash
# Restore PostgreSQL JasaBersih dari backup R2.
# Usage:
#   bash db-restore.sh                    # restore backup terbaru
#   bash db-restore.sh jasabersih-20260519-020000.sql.gz   # restore file spesifik
#
# WARNING: ini akan DROP & CREATE database. Konfirmasi diminta dulu.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/root/jasabersih-env/backup.env}"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

: "${PGDATABASE:?PGDATABASE not set}"
: "${R2_BUCKET:?R2_BUCKET not set}"
: "${R2_ENDPOINT:?R2_ENDPOINT not set}"

FILENAME="${1:-}"
if [[ -z "$FILENAME" ]]; then
  echo "==> Mencari backup terbaru di R2..."
  FILENAME=$(aws s3 ls "s3://${R2_BUCKET}/db/" --endpoint-url "${R2_ENDPOINT}" --profile r2 \
    | awk '{print $4}' | grep '\.sql\.gz$' | sort | tail -1)
  [[ -z "$FILENAME" ]] && { echo "❌ Gak nemu backup"; exit 1; }
  echo "    Pakai: ${FILENAME}"
fi

TMP_DIR=$(mktemp -d)
LOCAL_FILE="${TMP_DIR}/${FILENAME}"

echo "==> Download s3://${R2_BUCKET}/db/${FILENAME}"
aws s3 cp "s3://${R2_BUCKET}/db/${FILENAME}" "${LOCAL_FILE}" \
  --endpoint-url "${R2_ENDPOINT}" --profile r2

echo ""
echo "⚠️  AKAN DROP DATABASE: ${PGDATABASE}"
read -p "Lanjut? ketik 'yes' untuk konfirmasi: " CONFIRM
[[ "$CONFIRM" != "yes" ]] && { echo "Dibatalkan."; rm -rf "${TMP_DIR}"; exit 0; }

echo "==> Drop & recreate database"
PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d postgres -c "DROP DATABASE IF EXISTS ${PGDATABASE};"
PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d postgres -c "CREATE DATABASE ${PGDATABASE} OWNER ${PGUSER};"
PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d "${PGDATABASE}" -c "CREATE EXTENSION IF NOT EXISTS postgis;"

echo "==> Restore dump"
gunzip -c "${LOCAL_FILE}" | PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d "${PGDATABASE}"

rm -rf "${TMP_DIR}"
echo "✓ Restore done."
