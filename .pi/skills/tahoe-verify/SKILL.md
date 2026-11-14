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
command -v bun docker mkcert curl jq wrangler
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

### Path A — Docker (legacy; works until M2 removes Redis + SSE)

```bash
make certs                 # required; nginx mounts localhost.crt/key
docker compose up --build  # or: docker compose watch
```

- UI: `https://localhost`
- Health: `curl -k https://localhost/api/health`
- Ports: nginx 80/443, app 5173, API 3000, Redis 6379.
- Stop: `docker compose down`; reset state: `docker compose down -v`.

### Path B — Wrangler dev (target workflow, built by M0)

```bash
# Terminal 1
cd packages/api && bunx wrangler dev

# Terminal 2
cd packages/app && bun run dev
```

- UI: `http://localhost:5173`
- Health: `curl -s http://localhost:3000/health`
- **No Redis, no Docker, no nginx.**

Known gaps until M0:

- `GET /api/*` on port 5173 → 404 (Vite proxy not wired yet).
- `GET /room/:id` → 500 `fetch failed` (SSR base is `http://api:3000`).
- Session cookie is always `Secure`; plain-HTTP persistence is unreliable.

Use `http://localhost:3000/health` to verify the API alone.

## 3. Run the checks

```bash
cd packages/app && bun run check
cd packages/app && bun run build
cd packages/shared && bunx tsc --noEmit -p tsconfig.json
cd packages/api && bunx tsc --noEmit -p tsconfig.json
cd packages/shared && bun test
```

Expected as of the last handoff:

| Check | Expected |
| --- | --- |
| `packages/app` check | 4 errors in `shared` (type-only imports) until M0-5 |
| `packages/api` typecheck | same 4 errors |
| `packages/shared` typecheck | clean |
| `packages/shared` tests | no tests yet |
| `packages/app` build | passes, with an `adapter-auto` warning (expected until M6-1) |

If a failure differs from this baseline, it is likely new: report it with file:line.

## 4. API smoke test

Use a cookie jar; the seat is tied to `session_id`. If `jq` is unavailable, print the raw
JSON and read the `roomId` field manually.

```bash
BASE_URL=${BASE_URL:-http://localhost:3000}    # wrangler dev default
JAR=/tmp/tahoelink.cookies
ROOM=$(curl -s -c "$JAR" -X POST "$BASE_URL/create-room" | jq -r .roomId)
echo "room=$ROOM"

curl -s -b "$JAR" -c "$JAR" -X POST "$BASE_URL/room/$ROOM/join" \
  -H 'content-type: application/json' -d '{"playerId":0}' | jq

curl -s -b "$JAR" "$BASE_URL/room/$ROOM" | jq
```

For the Docker/nginx path, set `BASE_URL=https://localhost/api` (and add `-k`).

Expected: room ID returned; join returns `playerId` + `playerIds`; room GET returns the
default room and player ID 0. A missing cookie jar means every request is a new session.

## 5. State inspection

### Legacy — Redis (before M2)

```bash
redis-cli --scan --pattern 'room:*'
redis-cli hgetall room:$ROOM
redis-cli lrange players:$ROOM 0 -1
```

Inside Docker: prefix with `docker compose exec redis`. Check `board` is valid JSON, 10×10;
`stage` is valid; `activePlayer` is a seat ID (0–3).

### Target — DO storage (after M2)

The DO stores room state in SQLite. Inspect via a debug endpoint or:

```bash
# After M2: add a GET /admin/room/:id that dumps DO state
curl -s "http://localhost:3000/admin/room/$ROOM"
```

Or use `wrangler tail` in production to observe state changes.

## 6. Realtime inspection

### Legacy — SSE (before M2)

```bash
curl -Ns "http://localhost:3000/sse/room/$ROOM"
```

Expected: `event: connected`. A second client joining should produce `player-joined`.
The sender is excluded from its own broadcast, so use two cookie jars.

### Target — WebSocket (after M2)

Use `websocat` or a browser WebSocket console:

```bash
# Install: cargo install websocat  (or brew install websocat)
websocat "ws://localhost:3000/ws/room/$ROOM"
```

Expected: a `state` event with the full room snapshot on connect, then incremental updates.

## 7. Two-browser check

Two tabs in the same browser share the `session_id` cookie and cannot claim two seats. Use
two browsers (e.g. Chrome + Safari) or a normal + incognito window. Verify:

1. Player A creates a room and joins seat 0.
2. Player B opens the invite URL and joins seat 1; both see both players.
3. A refreshes; A keeps its seat (cookie).
4. A starts the game once the DO state machine exists (M3+).
5. A move appears on B's board once the DO turn handler is implemented (M3-5).
6. A reloads mid-game and recovers the same state (M3-7).

## 8. Troubleshooting

| Symptom | Likely cause | Task |
| --- | --- | --- |
| `/api/*` 404 on 5173 | No Vite proxy; not behind nginx | M0-1 |
| `/room/:id` 500 `fetch failed` | SSR base is `http://api:3000` | M0-1 |
| Lobby state does not stick over HTTP | Always-`Secure` cookie | M0-2 |
| `bunx wrangler dev` fails | Missing `wrangler.jsonc` or Workers entry | M0-4 |
| Turn returns 500 `board[col].findIndex` | Placement past the right edge | M1-2 |
| Turn returns 500 after a tall stack | Ceiling overflow is not validated | M1-2 |
| WebSocket connects but never updates | Handler not wired in DO | M2-3 |
| `bun run check` fails in `shared` | Type-only imports | M0-5 |

Do not work around these with try/catch or client-side fixes; link the task instead.

## 9. Report format

```text
Verdict: PASS | PASS WITH KNOWN FAILURES | FAIL
Environment: bun x.y.z; docker yes/no; mkcert yes/no; wrangler yes/no

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
