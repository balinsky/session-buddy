#!/usr/bin/env bash
# Round-trip smoke test for the Classes / Class Series / Musician REST API.
# Creates a series + musician + class linking them, prints the class detail,
# then cleans up. Safe to run repeatedly; uses clearly-named test entities.
#
# Requires: a running server on http://localhost:3001, jq, an existing sync
# code with at least one tune in it. Defaults to test-data-01.
#
# Override defaults with env vars:
#   SYNC=green-plain-64 ./scripts/smoke-classes-api.sh
#   BASE=http://other-host:3001/api ./scripts/smoke-classes-api.sh

set -e

: "${SYNC:=test-data-01}"
: "${BASE:=http://localhost:3001/api}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq)" >&2
  exit 1
fi

H=(-H "x-sync-code: $SYNC" -H "Content-Type: application/json")

echo "── Sync code: $SYNC, base URL: $BASE"
echo

echo "── Create a class series:"
SID=$(curl -sS -X POST "${H[@]}" \
  -d '{"name":"Smoke Test Series","organizer":"Smoke Test","instrument":"D Flute"}' \
  "$BASE/class-series" | jq .id)
echo "  series id: $SID"

echo "── Create a musician:"
MID=$(curl -sS -X POST "${H[@]}" \
  -d '{"name":"Smoke Test Musician","instruments":"Flute, Whistle"}' \
  "$BASE/musicians" | jq .id)
echo "  musician id: $MID"

echo "── Pick the first tune in this collection to attach:"
TID=$(curl -sS -H "x-sync-code: $SYNC" "$BASE/tunes" | jq '.[0].id')
TNAME=$(curl -sS -H "x-sync-code: $SYNC" "$BASE/tunes" | jq -r '.[0].name')
echo "  tune id: $TID ($TNAME)"

echo "── Create a class linking series + musician + tune:"
CID=$(curl -sS -X POST "${H[@]}" \
  -d "{\"name\":\"Smoke Test Class\",\"series_id\":$SID,\"date\":\"2025-03-15\",\"tune_ids\":[$TID],\"instructor_ids\":[$MID]}" \
  "$BASE/classes" | jq .id)
echo "  class id: $CID"
echo

echo "── Class detail (nested series, instructors, tunes):"
curl -sS -H "x-sync-code: $SYNC" "$BASE/classes/$CID" | jq
echo

echo "── Musician detail (should list the class above):"
curl -sS -H "x-sync-code: $SYNC" "$BASE/musicians/$MID" | jq
echo

echo "── Cleanup:"
curl -sS -X DELETE -H "x-sync-code: $SYNC" "$BASE/classes/$CID" -w "  class    HTTP %{http_code}\n" -o /dev/null
curl -sS -X DELETE -H "x-sync-code: $SYNC" "$BASE/musicians/$MID" -w "  musician HTTP %{http_code}\n" -o /dev/null
curl -sS -X DELETE -H "x-sync-code: $SYNC" "$BASE/class-series/$SID" -w "  series   HTTP %{http_code}\n" -o /dev/null
echo
echo "Done."
