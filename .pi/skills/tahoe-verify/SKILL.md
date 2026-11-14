---
name: tahoe-verify
description: Verify TahoeLink changes. Run after a PLAN task, before committing, or when
  checks fail. Covers the shared engine, API checks, and two-browser flows.
---

# TahoeLink verification

Read `AGENTS.md` §3 and `docs/HANDOFF.md` first. This skill is for observing and reporting;
do not fix code unless the user asks.

## 0. Probe the environment

```bash
command -v bun curl jq wrangler
bun --version
```

As of the last handoff: Bun 1.4.4; Docker, mkcert, and Redis are **not installed** on this
machine. Report missing prerequisites and use the alternative path; never install a heavy
dependency without asking.

## 1. Install dependencies

From the repository root only (never inside a workspace package):

```bash
bun install
```

## 2. Start the stack

### Wrangler dev (current workflow)

```bash
# Terminal 1
cd packages/api && bunx wrangler dev

# Terminal 2
cd packages/app && bun run dev
```

- UI: `http://localhost:5173`
- Health: `curl -s http://localhost:3000/health` (or 8787, the default wrangler port)
- **No Docker, no Redis, no nginx.**

Known gaps (M0 complete):

- Session cookie may be `Secure` in plain HTTP: set `COOKIE_SECURE=false` if needed.

## 3. Run the checks

```bash
cd packages/app && bun run check
cd packages/app && bun run build
cd packages/shared && bunx tsc --noEmit -p tsconfig.json
cd packages/api && bunx tsc --noEmit -p tsconfig.json
cd packages/shared && bun test
cd packages/api && bun test          # DO lifecycle tests (start wrangler dev first)
```

Expected as of the last handoff:

| Check | Expected |
| --- | --- |
| `packages/app` check | 0 errors, 1 a11y warning (Board.svelte buttons) |
| `packages/api` typecheck | clean |
| `packages/shared` typecheck | clean |
| `packages/shared` tests | 180+ pass (engine: placement, dice, scoring, supply, skip-turn) |
| `packages/api` tests | 16 pass (DO lifecycle: create, join, start, turn, leave, WS) |
| `packages/app` build | passes, with an `adapter-auto` warning (expected until M6-1) |

If a failure differs from this baseline, it is likely new: report it with file:line.

## 4. API smoke test

Use the smoke script (handles cookies automatically):

```bash
bash scripts/smoke.sh
```

Or manually (cookie jar approach):

```bash
BASE_URL=${BASE_URL:-http://localhost:3000}
JAR=/tmp/tahoelink.cookies
ROOM=$(curl -s -c "$JAR" -X POST "$BASE_URL/create-room" | jq -r .roomId)
echo "room=$ROOM"
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE_URL/room/$ROOM/join" \
  -H 'content-type: application/json' -d '{}' | jq
curl -s -b "$JAR" "$BASE_URL/room/$ROOM" | jq
```

Expected: room ID returned; join returns `playerId` + `playerIds`; room GET returns the
default room and player ID 0. A missing cookie jar means every request is a new session.

## 5. State inspection

### DO storage

The DO stores room state in SQLite-backed `ctx.storage`. Inspect by reading the room via
the API:

```bash
curl -s "http://localhost:3000/room/$ROOM" | jq
```

Or use `wrangler tail` in production to observe state changes.

## 6. Realtime inspection

### WebSocket (current)

Use `websocat` or a browser WebSocket console:

```bash
# Install: cargo install websocat  (or brew install websocat)
websocat "ws://localhost:3000/ws/room/$ROOM"
```

Expected: a `connected` event, then a `state` event with the full room snapshot.

## 7. Two-browser check

Two tabs in the same browser share the `session_id` cookie and cannot claim two seats. Use
two browsers (e.g. Chrome + Safari) or a normal + incognito window. Verify:

1. Player A creates a room and joins seat 0.
2. Player B opens the invite URL and joins seat 1; both see both players.
3. A refreshes; A keeps its seat (cookie).
4. A starts the game (M3+).
5. A move appears on B's board (M3-5).
6. A reloads mid-game and recovers the same state (M3-7).

## 8. Troubleshooting

| Symptom | Likely cause | Task |
| --- | --- | --- |
| `/api/*` 404 on 5173 | Vite proxy not running | M0-1 |
| `/room/:id` 500 | DO not initialized; create room first | — |
| Turn returns 500 | Ceiling overflow or invalid placement | M1-2 |
| WebSocket connects but no updates | Handler not wired in DO | M2-3 |
| `bun run check` fails in `shared` | Type-only imports (fixed) | M0-5 |
| `bun test` in API fails | Wrangler dev not running | M2-6 |

Do not work around these with try/catch or client-side fixes; link the task instead.

## 9. Report format

```text
Verdict: PASS | PASS WITH KNOWN FAILURES | FAIL
Environment: bun x.y.z; wrangler yes/no

Commands:
- <command> -> exit <code>; <one-line result>
- ...

Failures:
- <file>:<line> — <message> — pre-existing (HANDOFF) or new

Flows exercised:
- <flow> — <observed result>

Not verified:
- <what and why>

Recommended next task: <PLAN task ID>
```
