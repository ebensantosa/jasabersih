#!/usr/bin/env bash
# Backup PostgreSQL JasaBersih -> upload ke Cloudflare R2.
# Pasang sebagai cron daily. Retention: keep last 14 hari di R2 (lifecycle rule di R2).
#
# ENV yang harus di-set (taruh di /root/jasabersih-env/backup.env):
#   PGUSER, PGPASSWORD, PGDATABASE, PGHOST (default localhost), PGPORT (default 5432)
#   R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT
#
# Setup awal (sekali):
#   apt-get install -y awscli
#   aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID" --profile r2
#   aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY" --profile r2
#   aws configure set region auto --profile r2
#
# Cron entry (crontab -e):
#   0 2 * * * /var/www/jasabersih/scripts/db-backup.sh >> /var/log/jasabersih-backup.log 2>&1

set -euo pipefail

ENV_FILE="${ENV_FILE:-/root/jasabersih-env/backup.env}"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

: "${PGDATABASE:?PGDATABASE not set}"
: "${R2_BUCKET:?R2_BUCKET not set}"
: "${R2_ENDPOINT:?R2_ENDPOINT not set}"

TS=$(date -u +%Y%m%d-%H%M%S)
TMP_DIR=$(mktemp -d)
DUMP_FILE="${TMP_DIR}/jasabersih-${TS}.sql.gz"

echo "[$(date -u)] Dumping ${PGDATABASE} -> ${DUMP_FILE}"
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
  -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" \
  -U "${PGUSER:-postgres}" \
  --no-owner --no-acl \
  "${PGDATABASE}" | gzip -9 > "${DUMP_FILE}"

SIZE=$(stat -c%s "${DUMP_FILE}")
echo "[$(date -u)] Dump size: ${SIZE} bytes"

echo "[$(date -u)] Upload to r2://${R2_BUCKET}/db/$(basename "${DUMP_FILE}")"
aws s3 cp "${DUMP_FILE}" "s3://${R2_BUCKET}/db/$(basename "${DUMP_FILE}")" \
  --endpoint-url "${R2_ENDPOINT}" \
  --profile r2

rm -rf "${TMP_DIR}"
echo "[$(date -u)] ✓ Backup done."
