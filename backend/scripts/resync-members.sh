#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:-https://auth.portal.mhub.org/webhook/peoplevine}"
DELAY_SECONDS="${DELAY_SECONDS:-5}"

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <peoplevine-id | file-with-one-id-per-line>"
  exit 1
fi

if [ -f "$1" ]; then
  IDS=$(grep -E '^[0-9]+$' "$1" || true)
else
  IDS="$1"
fi

if [ -z "$IDS" ]; then
  echo "No PeopleVine IDs found."
  exit 1
fi

if [ -z "${WEBHOOK_SECRET:-}" ]; then
  printf "Webhook secret: "
  read -rs WEBHOOK_SECRET
  echo
fi

TOTAL=$(echo "$IDS" | wc -l | tr -d ' ')
COUNT=0

for ID in $IDS; do
  COUNT=$((COUNT + 1))
  RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: $WEBHOOK_SECRET" \
    -d "{\"customer_no\": $ID, \"event_type\": \"manual_resync\"}")
  echo "[$COUNT/$TOTAL] $ID $RESPONSE"
  if echo "$RESPONSE" | grep -q "Unauthorized"; then
    echo "Wrong webhook secret. Stopped."
    exit 1
  fi
  if [ "$COUNT" -lt "$TOTAL" ]; then
    sleep "$DELAY_SECONDS"
  fi
done
