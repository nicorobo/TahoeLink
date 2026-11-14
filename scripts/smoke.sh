#!/usr/bin/env bash
set -euo pipefail

# TahoeLink smoke test
# Starts wrangler dev (if not already running), checks health,
# then exercises the full DO lifecycle (create, join, start, turn, leave).
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
  for port in 8787 8788 3000; do
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
      for port in 8787 8788 3000; do
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
COOKIE_JAR=$(mktemp)
cleanup() { rm -f "$COOKIE_JAR"; kill "${PID:-}" 2>/dev/null || true; }

# Helper: request with cookie persistence
req() {
  local method="${1:-GET}" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X "$method" \
      -H 'Content-Type: application/json' -d "$body" "$API_BASE$path"
  else
    curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X "$method" "$API_BASE$path"
  fi
}

echo ""
echo "--- 1. Health check ---"
HEALTH=$(req GET /health)
echo "$HEALTH"
echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='ok'"
echo "PASS"

echo ""
echo "--- 2. Create room ---"
CREATE=$(req POST /create-room)
echo "$CREATE"
ROOM_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['roomId'])")
echo "Room: $ROOM_ID"
echo "PASS"

echo ""
echo "--- 3. Join as player 0 ---"
JOIN1=$(req POST "/room/$ROOM_ID/join" '{}')
echo "$JOIN1"
echo "$JOIN1" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['playerId']==0"
echo "PASS"

echo ""
echo "--- 4. Join as player 1 ---"
# Get a second session cookie by not sending the cookie jar
SESSION2=$(curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -c /tmp/tahoe-smoke-c2 "$API_BASE/room/$ROOM_ID/join")
echo "$SESSION2"
echo "$SESSION2" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['playerIds']==[0,1]"
echo "PASS"

echo ""
echo "--- 5. Start game ---"
START=$(curl -s -b "$COOKIE_JAR" -X POST "$API_BASE/room/$ROOM_ID/start")
echo "$START"
echo "$START" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['stage']=='in-progress'"
echo "PASS"

echo ""
echo "--- 6. Make a turn ---"
TURN=$(curl -s -b "$COOKIE_JAR" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"column":0,"shape":"L","rotation":0,"flip":false}' \
  "$API_BASE/room/$ROOM_ID/turn")
echo "$TURN"
echo "$TURN" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['turn']==1"
echo "PASS"

echo ""
echo "--- 7. Leave ---"
LEAVE=$(curl -s -b /tmp/tahoe-smoke-c2 -X POST "$API_BASE/room/$ROOM_ID/leave")
echo "$LEAVE"
echo "$LEAVE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['playerIds']==[0]"
echo "PASS"

echo ""
echo "=== Full smoke test passed ==="
rm -f /tmp/tahoe-smoke-c2 "$COOKIE_JAR"
