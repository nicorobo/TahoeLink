# Handoff — current project state

Read this at the start of every session, after `AGENTS.md` and before `PLAN.md`. It is the
short-term memory of the project: keep it roughly 40–60 lines. Keep the last 2–3 session
entries; older detail lives in git and `PLAN.md`, so archive rather than endlessly append.

## Snapshot

- Date: 2026-11-13
- Branch: `main`, based on `949a0e0`; docs are uncommitted
- Current milestone: **M0 not started**
- Next task: **M0-4** (typecheck), then **M0-1/M0-2/M0-3** (native dev path)
- Deployment decision: **not made** (hybrid vs Cloudflare-native; see `docs/DEPLOYMENT.md`)

To resume: read `AGENTS.md`, then run `/task <next-id>`; use `/verify` before committing and
`/handoff` at the end of the session.

## What changed last session

- Added `AGENTS.md`, `PLAN.md`, `docs/DEPLOYMENT.md`, `docs/HANDOFF.md`.
- Rewrote `README.md`.
- Added agent scaffolding: `.pi/prompts/{task,handoff,verify}.md` and
  `.pi/skills/tahoe-verify/SKILL.md`.
- **No application code changed.**

## Verified evidence

| Check | Result |
| --- | --- |
| API starts (`bun src/main.ts`) | yes; `GET /health` → 200 |
| Web starts (`bun run dev`) | yes; `/` → 200 |
| `GET /room/:id` via plain Vite | **500** (`fetch failed`, SSR to `http://api:3000`) |
| `GET /api/health` via plain Vite | **404** (no proxy) |
| `bun run check` | **fails**: 4 type-only-import errors in `packages/shared` |
| `bun run build` | passes (adapter-auto warning; expected until M6) |
| `packages/shared` typecheck | clean |
| `packages/shared` tests | none exist |
| Docker Compose path | **not run** (Docker absent) |

## Not verified

- Docker/nginx/TLS/SSE end-to-end.
- Any multiplayer flow (no playable game yet).
- Browser cookie behavior over plain HTTP.
- Cloudflare deployment options.

## Open questions / decisions

- **Rules R1–R12** in `PLAN.md` § Rules contract are unanswered. Do not implement scoring
  until the die faces, piece counts, link scoring, flips, skip/reroll, and end condition are
  confirmed.
- Deployment shape (hybrid vs Cloudflare-native) should be decided before M3/M6.
- SSR for `/room`: leaning `ssr = false` (state is client-owned and SSE-driven).

## Environment

- Bun 1.4.4, Node 24, macOS.
- Docker, Redis, and mkcert are **not installed** on this machine.
- Docker path is the intended workflow; native path needs M0 first.

## Session log

### 2026-11-13 — documentation + agent scaffolding

- Added the docs and the `/task`, `/handoff`, `/verify` templates plus the `tahoe-verify`
  skill.
- Established the operating model: one deliverable per session, a Pendant goal per
  milestone, subagents for exploration/review/verification.
- Next: start M0 with `/task M0-4`, then `/task M0-1`.
