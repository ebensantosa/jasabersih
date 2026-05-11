#!/usr/bin/env bash
# End-to-end smoke test: booking → flip pay (simulated webhook) → cleaner accept → complete → payout.
# Run on VPS: bash scripts/e2e-payment-flow.sh
set -euo pipefail

API="${API:-https://api.jasabersih.com/v1}"
CUSTOMER_PHONE="${CUSTOMER_PHONE:?set CUSTOMER_PHONE=628xxx (existing customer)}"
CUSTOMER_PASS="${CUSTOMER_PASS:?set CUSTOMER_PASS=...}"
CLEANER_PHONE="${CLEANER_PHONE:?set CLEANER_PHONE=628xxx (existing approved cleaner)}"
CLEANER_PASS="${CLEANER_PASS:?set CLEANER_PASS=...}"

PG_PSQL_CMD="${PG_PSQL_CMD:-PGPASSWORD=\$(grep DATABASE_URL /var/www/jasabersih/apps/api/.env | sed \"s/.*:\\([^@]*\\)@.*/\\1/\") psql -h localhost -U jasabersih -d jasabersih -tAc}"

step() { echo; echo "▶ $*"; }
die() { echo "✗ $*" >&2; exit 1; }
psqlc() { eval "$PG_PSQL_CMD \"\$1\""; }

# Get Flip validation token from DB so we can post a valid webhook ourselves
step "Fetching Flip validation token from app_config"
FLIP_TOKEN=$(psqlc "SELECT (value #>> '{}') FROM app_config WHERE key='payment.flip_validation_token'")
[ -z "$FLIP_TOKEN" ] && die "Flip validation token kosong di app_config — set di /admin/app-settings dulu."
echo "  token: ${FLIP_TOKEN:0:8}…"

step "Login as customer ($CUSTOMER_PHONE)"
CUSTOMER_TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"phone\":\"$CUSTOMER_PHONE\",\"password\":\"$CUSTOMER_PASS\"}" \
  | jq -r '.data.accessToken // .accessToken')
[ -z "$CUSTOMER_TOKEN" ] || [ "$CUSTOMER_TOKEN" = "null" ] && die "Customer login failed"
echo "  ok"

step "Create booking (package mode, no packageId — uses fallback)"
SCHED=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%S.000Z)
BOOKING_JSON=$(curl -fsS -X POST "$API/bookings" \
  -H "authorization: Bearer $CUSTOMER_TOKEN" -H 'content-type: application/json' \
  -d "{
    \"pricingMode\":\"package\",
    \"scheduledAt\":\"$SCHED\",
    \"addressLine\":\"Jalan Tester E2E, Kota Yogyakarta, DIY\",
    \"baseAmount\":75000, \"totalAmount\":75000,
    \"formSnapshot\":{\"e2e\":true}
  }")
BOOKING_ID=$(echo "$BOOKING_JSON" | jq -r '.data.id // .id')
[ -z "$BOOKING_ID" ] || [ "$BOOKING_ID" = "null" ] && die "Booking create failed: $BOOKING_JSON"
echo "  bookingId: $BOOKING_ID"

step "POST /payments/flip/create"
FLIP_JSON=$(curl -fsS -X POST "$API/payments/flip/create" \
  -H "authorization: Bearer $CUSTOMER_TOKEN" -H 'content-type: application/json' \
  -d "{\"bookingId\":\"$BOOKING_ID\"}")
PAYMENT_ID=$(echo "$FLIP_JSON" | jq -r '.data.paymentId // .paymentId')
LINK_ID=$(echo "$FLIP_JSON" | jq -r '.data.linkId // .linkId')
CHECKOUT=$(echo "$FLIP_JSON" | jq -r '.data.checkoutUrl // .checkoutUrl')
[ -z "$PAYMENT_ID" ] || [ "$PAYMENT_ID" = "null" ] && die "Flip create failed: $FLIP_JSON"
echo "  paymentId=$PAYMENT_ID linkId=$LINK_ID"
echo "  checkout: $CHECKOUT"

step "Simulate Flip callback (POST form-urlencoded with valid token)"
DATA_PAYLOAD="{\"id\":\"e2e-bill-$RANDOM\",\"bill_link_id\":$LINK_ID,\"status\":\"SUCCESSFUL\",\"amount\":75000,\"sender_name\":\"E2E Test\"}"
CALLBACK_RESP=$(curl -fsS -X POST "$API/payments/flip/callback" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "data=$DATA_PAYLOAD" --data-urlencode "token=$FLIP_TOKEN")
echo "  callback: $CALLBACK_RESP"

step "Verify booking status switched to 'searching'"
sleep 1
B_STATUS=$(psqlc "SELECT status FROM bookings WHERE id='$BOOKING_ID'::uuid")
[ "$B_STATUS" = "searching" ] || die "Expected searching, got '$B_STATUS'"
echo "  status=$B_STATUS ✓"

step "Login as cleaner ($CLEANER_PHONE)"
CLEANER_TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"phone\":\"$CLEANER_PHONE\",\"password\":\"$CLEANER_PASS\"}" \
  | jq -r '.data.accessToken // .accessToken')
[ -z "$CLEANER_TOKEN" ] || [ "$CLEANER_TOKEN" = "null" ] && die "Cleaner login failed"
echo "  ok"

step "Cleaner sees booking in /cleaner/jobs/available"
AVAIL=$(curl -fsS "$API/cleaner/jobs/available" -H "authorization: Bearer $CLEANER_TOKEN")
COUNT=$(echo "$AVAIL" | jq "[.data[]? // .[]? | select(.id==\"$BOOKING_ID\")] | length")
[ "$COUNT" -ge 1 ] || die "Booking $BOOKING_ID NOT in available jobs (cleaner.kyc_status not approved? area filter?)"
echo "  visible to cleaner ✓"

step "Cleaner accepts"
ACCEPT=$(curl -fsS -X POST "$API/cleaner/jobs/$BOOKING_ID/accept" -H "authorization: Bearer $CLEANER_TOKEN")
echo "  $ACCEPT"

step "Force-bypass photo enforcement: insert mock before+after photos via SQL"
psqlc "INSERT INTO booking_photos (booking_id, photo_type, uploaded_by, storage_path) SELECT '$BOOKING_ID'::uuid, 'before', cleaner_id, 'e2e/before.jpg' FROM bookings WHERE id='$BOOKING_ID'::uuid"
psqlc "INSERT INTO booking_photos (booking_id, photo_type, uploaded_by, storage_path) SELECT '$BOOKING_ID'::uuid, 'after',  cleaner_id, 'e2e/after.jpg'  FROM bookings WHERE id='$BOOKING_ID'::uuid"
echo "  photos seeded"

step "Cleaner advance: matched → on_the_way"
curl -fsS -X POST "$API/cleaner/jobs/$BOOKING_ID/status" -H "authorization: Bearer $CLEANER_TOKEN" \
  -H 'content-type: application/json' -d '{"to":"on_the_way"}' | jq -c .

step "Cleaner advance: on_the_way → in_progress"
curl -fsS -X POST "$API/cleaner/jobs/$BOOKING_ID/status" -H "authorization: Bearer $CLEANER_TOKEN" \
  -H 'content-type: application/json' -d '{"to":"in_progress"}' | jq -c .

step "Cleaner advance: in_progress → completed (triggers payout ledger)"
curl -fsS -X POST "$API/cleaner/jobs/$BOOKING_ID/status" -H "authorization: Bearer $CLEANER_TOKEN" \
  -H 'content-type: application/json' -d '{"to":"completed"}' | jq -c .

step "Verify booking status=completed"
B_STATUS=$(psqlc "SELECT status FROM bookings WHERE id='$BOOKING_ID'::uuid")
[ "$B_STATUS" = "completed" ] || die "Expected completed, got '$B_STATUS'"
echo "  status=$B_STATUS ✓"

step "Verify cleaner wallet ledger entry"
LEDGER=$(psqlc "SELECT amount::text || '|' || status FROM wallet_ledger_entries WHERE reference_id='$BOOKING_ID'::uuid AND reference_type='booking' AND account_type='earnings'")
[ -z "$LEDGER" ] && die "No wallet ledger entry for completed booking — cleaner_payout might be 0/null"
echo "  ledger: $LEDGER ✓"

echo
echo "✅ END-TO-END FLOW PASSED"
echo "   bookingId=$BOOKING_ID"
echo "   paymentId=$PAYMENT_ID"
