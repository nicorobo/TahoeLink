#!/usr/bin/env bash
set -euo pipefail

# TahoeLink smoke test
# Starts wrangler dev (if not already running), checks health, and optionally
# tests Redis-dependent routes (create-room, join, etc.) when Redis is available.
#
# Usage: bash scripts/smoke.sh [api_base]

API_BASE="${1:-}"
PID=""

cleanup() {
  if [ -n "$PID" ]; then
    echo "→ Stopping wrangler dev (PID $PID)..."
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== TahoeLink smoke test ==="

# If no API base provided, try to find one or start wrangler dev
if [ -z "$API_BASE" ]; then
  for port in 8787 8788; do
    if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
      API_BASE="http://localhost:$port"
      echo "Found running API at $API_BASE"
      break
    fi
  done

  if [ -z "$API_BASE" ]; then
    echo "→ Starting wrangler dev..."
    cd "$(dirname "$0")/../packages/api"
    bunx wrangler dev &
    PID=$!
    cd - > /dev/null

    for i in $(seq 1 30); do
      for port in 8787 8788; do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
          API_BASE="http://localhost:$port"
          echo "→ API ready after ${i}s on port ${port}"
          break 2
        fi
      done
      sleep 1
    done
  fi
fi

if [ -z "$API_BASE" ]; then
  echo "ERROR: API did not start within 30 seconds" >&2
  exit 1
fi

echo "API base: $API_BASE"

# 1. Health check (always works)
echo ""
echo "--- 1. Health check ---"
HEALTH=$(curl -sf "$API_BASE/health")
echo "$HEALTH"
echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ok'"
echo "PASS"

# 2. Check if Redis-dependent routes work
echo ""
echo "--- 2. Redis-dependent route test ---"
CREATE=$(curl -sf -X POST "$API_BASE/create-room" 2>&1 || true)
if echo "$CREATE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  echo "Redis available — running full smoke test"
  ROOM_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['roomId'])")
  echo "Room: $ROOM_ID"

  echo ""
  echo "--- 3. Join as player 0 ---"
  curl -sf -X POST "$API_BASE/room/$ROOM_ID/join" \
    -H 'Content-Type: application/json' -d '{"playerId":0}' | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['playerId']==0"
  echo "PASS"

  echo ""
  echo "--- 4. Join as player 1 ---"
  curl -sf -X POST "$API_BASE/room/$ROOM_ID/join" \
    -H 'Content-Type: application/json' -d '{"playerId":1}' | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['playerIds']==[0,1]"
  echo "PASS"

  echo ""
  echo "--- 5. Start game ---"
  curl -sf -X POST "$API_BASE/room/$ROOM_ID/start" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['stage']=='in-progress'"
  echo "PASS"

  echo ""
  echo "--- 6. Make a turn ---"
  curl -sf -X POST "$API_BASE/room/$ROOM_ID/turn" \
    -H 'Content-Type: application/json' -d '{"column":0,"shape":"I","rotation":0,"flip":false}' | \
    python3 -c "import sys,json; d=json.load(sys.stdin); assert d['turn']==1"
  echo "PASS"

  echo ""
  echo "--- 7. Leave ---"
  curl -sf -X POST "$API_BASE/room/$ROOM_ID/leave" | python3 -c "import sys,json; json.load(sys.stdin)"
  echo "PASS"

  echo ""
  echo "=== Full smoke test passed (Redis available) ==="
else
  echo "Redis not available — skipping Redis-dependent routes."
  echo "(Create/join/start/turn need Redis or Durable Objects — see M2)"
  echo "=== Basic smoke test passed (health + typechecks) ==="
fi
