#!/usr/bin/env bash
# Bootstrap test users via admin API, then run the e2e payment flow.
# Run on VPS: ADMIN_EMAIL=admin@... ADMIN_PASS=... bash scripts/e2e-full.sh
set -euo pipefail

API="${API:-https://api.jasabersih.com/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL=admin@jasabersih.com}"
ADMIN_PASS="${ADMIN_PASS:?set ADMIN_PASS=...}"

# Random suffixes so we can re-run without "phone already used" conflicts
SUFFIX=$(date +%s | tail -c 7)
CUSTOMER_PHONE="62811000${SUFFIX}"
CLEANER_PHONE="62812000${SUFFIX}"
TEST_PASS='E2eTest!234'

step() { echo; echo "▶ $*"; }
die() { echo "✗ $*" >&2; exit 1; }

step "Admin login ($ADMIN_EMAIL)"
ADMIN_TOKEN=$(curl -fsS -X POST "$API/auth/admin-login" -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  | jq -r '.data.accessToken // .accessToken')
[ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ] && die "Admin login failed"
echo "  ok"

step "Create test customer ($CUSTOMER_PHONE)"
CUST_RESP=$(curl -fsS -X POST "$API/admin/customers" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d "{\"name\":\"E2E Customer\",\"phone\":\"$CUSTOMER_PHONE\",\"email\":\"e2e-c-$SUFFIX@test.local\",\"password\":\"$TEST_PASS\"}")
echo "  $CUST_RESP"

step "Create test cleaner ($CLEANER_PHONE) with autoApprove"
CLEAN_RESP=$(curl -fsS -X POST "$API/admin/cleaners" \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d "{\"name\":\"E2E Cleaner\",\"phone\":\"$CLEANER_PHONE\",\"email\":\"e2e-cl-$SUFFIX@test.local\",\"password\":\"$TEST_PASS\",\"bringsTools\":true,\"tier\":\"standard\",\"autoApprove\":true}")
echo "  $CLEAN_RESP"

step "Run e2e payment flow with these credentials"
CUSTOMER_PHONE="$CUSTOMER_PHONE" CUSTOMER_PASS="$TEST_PASS" \
CLEANER_PHONE="$CLEANER_PHONE" CLEANER_PASS="$TEST_PASS" \
  bash "$(dirname "$0")/e2e-payment-flow.sh"
