---
name: tahoe-verify
description: Verify TahoeLink changes by starting the local stack and running the API, web, and shared-engine checks. Use before committing, after completing a PLAN task, when a check fails, or when reproducing lobby/SSE/Redis behavior.
---

# TahoeLink verification

Read `AGENTS.md` §3 and `docs/HANDOFF.md` first. This skill is for observing and reporting;
do not fix code unless the user asks.

## 0. Probe the environment

```bash
command -v bun docker redis-server mkcert curl jq
bun --version
```

As of the last handoff: Bun 1.4.4; Docker, Redis, and mkcert are **not installed** on this
machine. Report missing prerequisites and use the alternative path; never install a heavy
dependency without asking.

## 1. Install dependencies

From the repository root only (never inside a workspace package):

```bash
bun install
```

## 2. Start the stack

### Path A — Docker (preferred; matches nginx/HTTPS/SSE)

```bash
make certs                 # required; nginx mounts localhost.crt/key
docker compose up --build  # or: docker compose watch
```

- UI: `https://localhost`
- Health: `curl -k https://localhost/api/health`
- Ports: nginx 80/443, app 5173, API 3000, Redis 6379.
- Stop: `docker compose down`; reset state: `docker compose down -v`.

### Path B — Native (currently blocked by M0)

```bash
# Terminal 1
redis-server

# Terminal 2
cd packages/api && REDIS_HOST=localhost PORT=3000 bun src/main.ts

# Terminal 3
cd packages/app && bun run dev
```

Known failures until M0 lands:

- `GET /api/*` on port 5173 → 404 (Vite has no proxy).
- `GET /room/:id` → 500 `fetch failed` (SSR calls `http://api:3000`).
- The session cookie is always `Secure`; plain-HTTP persistence is browser-dependent and
  unreliable. Use the Docker/HTTPS path if lobby state does not stick.

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
| `packages/app` check | 4 errors in `shared` (type-only imports) until M0-4 |
| `packages/api` typecheck | same 4 errors |
| `packages/shared` typecheck | clean |
| `packages/shared` tests | no tests yet |
| `packages/app` build | passes, with an `adapter-auto` warning (expected until M6) |

If a failure differs from this baseline, it is likely new: report it with file:line.

## 4. API smoke test

Prefer the HTTPS/nginx path. Use a cookie jar; the seat is tied to `session_id`. If `jq`
is unavailable, print the raw JSON and read the `roomId` field manually.

```bash
JAR=/tmp/tahoelink.cookies
ROOM=$(curl -sk -c "$JAR" -X POST https://localhost/api/create-room | jq -r .roomId)
echo "room=$ROOM"

curl -sk -b "$JAR" -c "$JAR" -X POST "https://localhost/api/room/$ROOM/join" \
  -H 'content-type: application/json' -d '{"playerId":0}' | jq

curl -sk -b "$JAR" "https://localhost/api/room/$ROOM" | jq
```

For the native API, replace `https://localhost/api` with `http://localhost:3000`.

Expected: room ID returned; join returns `playerId` + `playerIds`; room GET returns the
default room and player ID 0. A missing cookie jar means every request is a new session.

## 5. Redis inspection

```bash
redis-cli --scan --pattern 'room:*'
redis-cli hgetall room:$ROOM
redis-cli lrange players:$ROOM 0 -1
redis-cli get player:$ROOM:0
```

Inside Docker: prefix with `docker compose exec redis`. Look for:

- `board` is valid JSON with 10 arrays of 10 numbers.
- `stage` is one of `waiting-for-players`, `in-progress`, `complete`.
- `activePlayer` is a seat ID (0–3), not a list index.
- `players` contains only seats with a live `player:<room>:<id>` key.

## 6. SSE inspection

```bash
curl -Nsk "https://localhost/api/sse/room/$ROOM"
```

Expected: `event: connected`. A second client that joins should produce
`player-joined`. The sender is intentionally excluded from its own broadcast, so use two
clients/cookie jars to observe events.

## 7. Two-browser check

Two tabs in the same browser share the `session_id` cookie and cannot claim two seats. Use
two browsers (e.g. Chrome + Safari) or a normal + incognito window. Verify:

1. Player A creates a room and joins seat 0.
2. Player B opens the invite URL and joins seat 1; both see both players.
3. A refreshes; A keeps its seat (cookie).
4. A starts the game once M2/M4 exist.
5. A move appears on B's board once turns/SSE are implemented.
6. A reloads mid-game and recovers the same state (M3).

## 8. Troubleshooting

| Symptom | Likely cause | Task |
| --- | --- | --- |
| `/api/*` 404 on 5173 | No Vite proxy; not behind nginx | M0-1 |
| `/room/:id` 500 `fetch failed` | SSR base is `http://api:3000` | M0-1 |
| Lobby state does not stick over HTTP | Always-`Secure` cookie | M0-2 |
| `ECONNREFUSED 127.0.0.1:6379` | Redis not running or `REDIS_HOST` wrong | M0-3 |
| Turn returns 500 `board[col].findIndex` | Placement past the right edge | M1-2 |
| Turn returns 500 after a tall stack | Ceiling overflow is not validated | M1-2 |
| SSE connects but never updates | Broadcasts are per-process; sender excluded; no heartbeat | M3 |
| `bun run check` fails in `shared` | Type-only imports | M0-4 |

Do not work around these with try/catch or client-side fixes; link the task instead.

## 9. Report format

```text
Verdict: PASS | PASS WITH KNOWN FAILURES | FAIL
Environment: bun x.y.z; docker yes/no; redis yes/no; mkcert yes/no

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
