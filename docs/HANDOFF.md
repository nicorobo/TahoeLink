# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-14
- Branch: `main`; all of M0 implemented and verified locally
- Current milestone: **M0 complete** — Wrangler dev path works, checks pass, CI configured
- Next task: **M1-2** (safe placement + `tryPlacePiece`)

To resume: read `AGENTS.md`, then run `/task <next-id>`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed last session

All nine M0 subtasks:

| Task | Change | Files |
|------|--------|-------|
| M0-1 | Vite proxy `/api` → `localhost:3000`; `ssr = false` on room route; `API_BASE` simplified | `vite.config.ts`, `+page.ts`, `api.ts` |
| M0-2 | Cookie `Secure` from `X-Forwarded-Proto`/`COOKIE_SECURE` env | `sessionId.ts` |
| M0-3 | Swapped `node:crypto` for `crypto.randomUUID()` | `sessionId.ts` |
| M0-4 | `wrangler.jsonc` + Workers entry (`src/index.ts`); verified `/health` | `wrangler.jsonc`, `index.ts` |
| M0-5 | Fixed 4 type-only imports in `shared/src/events.ts` and `board.ts` | `events.ts`, `board.ts` |
| M0-6 | Root scripts (`dev`, `dev:api`, `dev:web`, `check`, `test`) + shared test script | `package.json` (root + shared) |
| M0-7 | `.env.example` files; cleaned `README.Docker.md`, `shared/bun.lock`; updated README | `.env.example` (api + app), `README.md` |
| M0-8 | GitHub Actions CI workflow | `.github/workflows/ci.yml` |
| M0-9 | Smoke script (health + optional full flow) | `scripts/smoke.sh` |

Plus: lazy Redis connection (Proxy pattern) to avoid Workers module-scope crash; decisions
log entries added for M0 choices.

## Verified evidence

| Check | Result |
| --- | --- |
| `bun run check` (app) | **0 errors**, 1 pre-existing a11y warning |
| `bunx tsc --noEmit` (shared) | clean |
| `bunx tsc --noEmit` (api) | clean |
| `bunx wrangler dev` starts | yes, port 8787/8788 |
| `GET /health` via wrangler | 200 — `{"status":"ok"}` |
| `POST /create-room` via wrangler | **500** (no Redis — expected, M2) |
| `GET /room/:id` SSR via browser | no longer attempted (ssr=false) |
| `docker compose` | not tested (no Docker on this machine) |

## Not verified / known gaps

- **Redis-dependent routes** (create-room, join, leave, start, turn) fail in wrangler dev
  without a Redis instance. This is the pre-M2 state; M0 only makes the proxy, typecheck,
  and CI work. Full end-to-end verification needs M2 (Durable Objects).
- **SSE broadcasts** work only in the Bun/Redis path, not on wrangler dev (Redis needed for
  lobby state). M2 replaces SSE with WebSocket via DO Hibernation API.
- **Smoke script** tested locally — health check passes; full flow skipped (no Redis).
- **Docker Compose** path unchanged; `README.md` updated to point to Wrangler as the
  recommended dev path.

## Open questions

- M1 (rules engine) needs tests before implementation. First task: M1-2 (`tryPlacePiece`) +
  golden fixtures.
- Confirm that all rules R1–R17 in PLAN.md are correct before coding scoring.

## Environment

- Bun 1.4.4, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.

## Session log

### 2026-11-14 — M0: Runnable baseline on Wrangler

Implemented all 9 M0 subtasks. Key decisions:
- SSR disabled on `/room/[roomId]` → no API base duality
- Cookie Secure derived from `X-Forwarded-Proto` (auto-detect TLS)
- Redis connection made lazy via Proxy (avoids Workers crash, prepares for M2 removal)
- All checks now pass (typecheck + svelte-check = 0 errors)
- CI workflow added; shared tests placeholder ready for M1

Next: **M1-2** — safe placement function + tests.
