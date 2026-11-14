# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-16 (session 7)
- Branch: `milestone-3.7-3.9-ws-snapshot-multitab-tests`
- Tasks completed: **M3-7, M3-8, M3-9** — M3 is now fully complete
- Current milestone: **M4** (complete the UI)

To resume: read `AGENTS.md`, then run `/task M4-1` (app shell) or another M4 task;
use `/verify` before committing and `/handoff` at the end of the session.

## What changed this session

| Task | Change | Files |
|------|--------|-------|
| M3-7 | Monotonic `stateVersion` in DO state; incremented on every `persist()`. Broadcast in state payloads, heartbeat events, and GET room responses. | `room-do.ts`, `events.ts`, `state.svelte.ts`, `events/index.ts` |
| M3-7 | DO alarm sends `heartbeat` event (~20s interval) to connected WebSockets. TTL (24h) checked inside same alarm handler. Idle rooms without WS connections sleep for TTL interval. | `room-do.ts` |
| M3-7 | Client ignores stale state messages — tracks `lastStateVersion` in event handler, skips messages with version ≤ current. | `events/index.ts` |
| M3-8 | DO tracks WebSocket connection count per session via in-memory `Map<string, number>`. Closing one tab decrements count; auto-leave only fires when last connection drops. | `room-do.ts` |
| M3-9 | 11 new API tests: 4-player game flow, invalid column/shape, wrong turn, state version monotonically increases, leave/rejoin mid-game, room-full rejection. | `room-do.test.ts` |

### New/updated event types

- `StatePayload` now includes `stateVersion: number`
- `ConnectedPayload` now includes `stateVersion: number`
- `HeartbeatPayload` added: `{ stateVersion: number }`; `'heartbeat'` event in `EventPayloadMap`
- DO `buildStatePayload()` and `handleGetRoom()` both include `stateVersion`

### Design decisions

1. **Single alarm for heartbeat + TTL**: DO only supports one `setAlarm`. The alarm handler sends heartbeat (~20s) then checks TTL (24h). When no WebSockets are connected, the alarm is set to the TTL interval instead of the heartbeat interval to avoid waking idle rooms.
2. **In-memory WS connection counter**: WebSocket connections are ephemeral; a DO restart drops all connections anyway. No need to persist per-session counters.
3. **Client-side stale-version filtering**: The app's event handler stores `lastStateVersion` and skips `state` events with `stateVersion <= lastStateVersion`. Heartbeat events update the version if the client fell behind.

## Verified evidence

| Check | Result |
| --- | --- |
| `cd packages/shared && bunx tsc --noEmit` | clean |
| `cd packages/api && bunx tsc --noEmit` | clean |
| `cd packages/app && bun run check` | 0 errors, 1 pre-existing a11y warning |
| `cd packages/shared && bun test` | **182 pass, 0 fail** |
| `cd packages/api && bun test` | **30 pass, 0 fail** (needs wrangler dev on :8787) |
| Manual curl flow: 4-player create → join ×4 → start → turn → leave → rejoin | All status 200; version increments confirmed |

## Not verified / known gaps

- **DO alarm heartbeat** not tested in automated tests — would require waiting 20s or mocking the alarm. Verified manually that the alarm fires and doesn't crash.
- **WebSocket multi-tab** auto-leave prevention not tested with two real browser connections (M4 task — Playwright or manual).
- **Stale version on client** not tested end-to-end — client-side ignore logic is in place but no test sends an out-of-order message.
- **3-player game** not explicitly tested — only 2-player and 4-player paths verified.
- **Game-over detection** not tested end-to-end (would need to fill the board).
- **Client-side handlers** for `state`/`game-over`/`heartbeat` are stubs (log or state update only); proper UI handling is M4.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-16 (session 7) — M3-7, M3-8, M3-9

**M3-7** — WebSocket snapshot + monotonic version + heartbeat:
- Added `stateVersion: number` field to `RoomDOState` (starts at 0, incremented on every `persist()`)
- DO alarm sends `heartbeat` event with current `stateVersion` every ~20s when WS clients are connected
- TTL (24h) checked inside `alarm()` handler; idle rooms without WS sleep until TTL
- `buildStatePayload()` and `handleGetRoom()` include `stateVersion`
- App event handler tracks `lastStateVersion` and ignores stale state messages

**M3-8** — Multiple tabs:
- Added in-memory `wsConnections: Map<string, number>` to the DO class
- `handleWebSocketUpgrade`: increments counter per session
- `webSocketClose`: decrements counter; only auto-leaves when counter reaches 0
- Connected event now sends `stateVersion` so clients can detect missed updates

**M3-9** — API tests:
- 4-player game flow test (create → join×4 → start → turn)
- Invalid column (99) — Zod catches → 400
- Wrong shape (doesn't match roll) — DO returns `INVALID_SHAPE` 400
- Wrong turn (player 0 tries again after their move) — DO returns `NOT_YOUR_TURN` 400
- Monotonic stateVersion verification (version increases after mutation)
- Leave mid-game → pauses, rejoin with same session → restores seat
- Room full → ROOM_FULL 400

**Bug fix**: Join route requires a JSON body (`{}`); the M3-9 test was missing `body: {}` in join calls, causing `zValidator` to fail with "Malformed JSON".

Next: **M4** (complete the UI) — start with M4-1 (app shell) or M4-3 (compose game screen).