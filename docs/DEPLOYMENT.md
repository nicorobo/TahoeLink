# Deployment

How to get TahoeLink onto a public URL, with a focus on Cloudflare. Read this before
starting **M6** in [PLAN.md](../PLAN.md), and record the chosen option in the decisions log.

Last reviewed: 2026-11-13. Cloudflare changes quickly — verify limits, bindings, adapter
config, and MCP URLs against the current official docs before implementing.

---

## TL;DR

| Option | Frontend | API + realtime | State | Effort | When to choose |
| ------ | -------- | -------------- | ----- | ------ | -------------- |
| **A. Hybrid** | Cloudflare Workers/Pages (`adapter-cloudflare`) | Keep Bun + Hono on Fly.io / Render / Railway, behind a custom domain | Managed Redis (Upstash or provider) | Low–medium | You want to ship v1 fast and keep the current API |
| **B. Cloudflare-native** | Cloudflare Workers | Hono on Workers + one **Durable Object per room** over WebSockets | Durable Object storage (SQLite) | Medium–high (rewrite of persistence + realtime) | You want one platform, low ops, and correct per-room fanout |
| **C. Realtime platform** | Anywhere | PartyKit / Cloudflare Realtime rooms | Platform storage | Medium | You want realtime handled for you and accept another dependency |

**Recommendation:** if the goal is Cloudflare, choose **B** before investing heavily in
SSE-specific behavior. If the goal is "playable soon", choose **A** now and revisit B after
v1. Do not deploy the current API to Workers unchanged; it will not run.

---

## Why the current API cannot run on Cloudflare Workers as-is

| Blocker | Detail | File |
| ------- | ------ | ---- |
| TCP Redis client | `ioredis` opens a raw TCP connection; Workers have no TCP sockets for this use case | `packages/api/src/redis.ts` |
| In-process SSE registry | `roomClients` is a `Map` in one process. Workers run many isolates; a broadcast in one isolate cannot reach sockets in another. Even two Bun/Fly instances have this problem | `packages/api/src/broadcasting/roomSSE.ts`, `broadcastToRoom.ts` |
| Bun server options | `export default { port, fetch, idleTimeout: 0 }` is Bun-specific; Workers use `export default { fetch }` | `packages/api/src/main.ts` |
| Node crypto | `node:crypto` requires the `nodejs_compat` flag; use Web Crypto instead | `packages/api/src/middleware/sessionId.ts` |
| Read-modify-write room state | No transaction/lock; a single-writer Durable Object is the natural fix | `packages/api/src/models/room.ts` |
| Long-lived SSE | Workers support streaming responses, but a DO with WebSocket hibernation is a better fit for many idle game rooms | — |

The shared rules engine (`packages/shared`) is portable and should be reused unchanged in
every option.

---

## Option A — Hybrid: Cloudflare frontend + hosted API

Keep the current Bun/Hono/Redis API and deploy only the SvelteKit app to Cloudflare.

### Architecture

```
app.example.com  → Cloudflare Worker (SvelteKit adapter-cloudflare)
                      └── /api/* and /sse/* proxied to api.example.com (same-site)
api.example.com  → Fly.io / Render / Railway (Bun + Hono + Redis)
                      └── managed Redis
```

Keep the browser on one origin by proxying `/api` through the SvelteKit Worker (a
`hooks.server.ts` handler or a Worker route). That avoids CORS credentials and
`EventSource` cross-origin cookie problems entirely.

### Steps

1. Add `@sveltejs/adapter-cloudflare` and switch `packages/app/svelte.config.js` from
   `adapter-auto`.
2. Set production API base:
   - Browser: `/api` (same origin).
   - SSR: `API_INTERNAL_URL=https://api.example.com` (or disable SSR for `/room`).
3. Deploy the API to the host. Set `PORT`, `REDIS_URL`, `COOKIE_SECURE=true`, and
   `NODE_ENV=production`. Use the host's health check on `GET /health`.
4. **Do not run more than one API instance** until M3-5 fixes fanout, or add Redis
   pub/sub so each instance relays broadcasts. Otherwise players on different instances
   never see each other's moves.
5. Provision Redis with TLS and a password. Upstash's REST client is *not* compatible with
   `ioredis`; use a TCP/TLS Redis endpoint (provider add-on, Redis Cloud, etc.) or swap the
   client for an HTTP-based one.
6. Configure the SvelteKit Worker route/proxy for `/api/*` and `/api/sse/*`. Preserve SSE:
   no buffering, no compression, long read timeout.
7. Add a custom domain and TLS. If frontend and API are on sibling subdomains, set the
   cookie `Domain=.example.com`, `SameSite=Lax` (or `Strict`), `Secure`, `HttpOnly`.
8. Add a `wrangler` deploy workflow (see §CI/CD).
9. Smoke test from two networks.

### Pros / cons

- **Pros:** smallest change; keeps Bun's fast dev loop; Redis pub/sub is a known path.
- **Cons:** two platforms and two deploy pipelines; Redis is a stateful dependency; SSE
  through proxies needs heartbeat and reconnect work anyway.

---

## Option B — Cloudflare-native with Durable Objects (recommended long-term)

One Durable Object instance per room acts as the single writer and the realtime hub. This
removes Redis, removes the cross-instance broadcast problem, and gives you a natural place
for turn transactions, timers, and TTL.

### Architecture

```
Browser
  │  HTTPS + WebSocket (wss://app.example.com/api/room/:id/ws)
  ▼
Cloudflare Worker (SvelteKit for UI + Hono API routes)
  │  fetch(roomId) → env.ROOMS.idFromName(roomId)
  ▼
RoomDurableObject (one per room)
  ├── SQLite/DO storage: room state, seats, scores, version
  ├── WebSocket Hibernation API: broadcast snapshots to connected clients
  ├── alarms: heartbeat, idle expiry, turn timeout (optional)
  └── imports @tahoelink/shared for rules (pure, portable)
```

Why this fits a board game:

- **Single writer per room** → atomic moves, no lost updates, no locks.
- **Fanout is local to the room** → no Redis pub/sub, no sticky sessions.
- **WebSocket hibernation** → idle rooms stop consuming duration; clients stay connected.
- **Alarms** → room expiry and heartbeat without a cron.
- **One platform** → one deploy, one set of logs, one bill.

### Migration map

| Current | Cloudflare-native |
| ------- | ----------------- |
| `main.ts` (Bun server) | Hono `export default app` on Workers (or SvelteKit server routes) |
| `redis.ts` | Delete; use DO storage |
| `models/room.ts` | `RoomDurableObject` methods (`getState`, `applyMove`, `join`, `leave`) |
| `models/players.ts` | Seat map inside the DO state |
| `broadcasting/*` | `this.ctx.getWebSockets()` + `webSocketMessage` / hibernation handlers |
| SSE `/sse/room/:id` | WebSocket `/api/room/:id/ws` (or keep SSE inside the DO if you prefer) |
| `sessionId` cookie | Same cookie, or a signed token; validate inside the DO on connect |
| `idleTimeout: 0` | Not needed |
| In-memory `roomClients` | DO WebSocket attachments (session ID + seat) |

Keep the HTTP API for create/join/state; route room mutations to the DO via RPC/fetch.
Clients can use WebSockets for state and HTTP for commands, or send commands over the
socket. Prefer one path for consistency.

### Local development

- `bunx wrangler dev` runs the Worker and local Durable Objects via workerd/miniflare; no
  Redis or Docker required. State persists under `.wrangler/`.
- Run the SvelteKit dev server against the local Worker (`/api` proxy target changes to the
  `wrangler dev` port), or run SvelteKit inside the Worker with `wrangler dev`.
- Put local secrets in `.dev.vars` (gitignored).
- Add `.wrangler/` to `.gitignore` (the app `.gitignore` already ignores it).

### Config sketch (verify against current Wrangler docs)

`wrangler.jsonc` for the API Worker:

```jsonc
{
  "name": "tahoelink-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"], // only if a dependency needs Node APIs
  "durable_objects": {
    "bindings": [{ "name": "ROOMS", "class_name": "RoomDurableObject" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RoomDurableObject"] }
  ],
  "observability": { "enabled": true }
}
```

`RoomDurableObject` skeleton:

```ts
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

export class RoomDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    // HTTP commands (create snapshot, join, move) and/or WebSocket upgrade
    // Persist state with this.ctx.storage; broadcast with this.ctx.getWebSockets()
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // parse command, validate against shared rules, persist, broadcast snapshot
  }

  async alarm() {
    // heartbeat / idle expiry
  }
}
```

SvelteKit side:

- `@sveltejs/adapter-cloudflare`, with a `wrangler.jsonc` that includes the generated Worker
  entry and an assets binding. Follow the adapter's current README for the exact file
  layout (it changes between releases).
- If the UI Worker also needs the DO binding, declare it in the app's `wrangler.jsonc`; or
  keep the API as a separate Worker bound to a route and proxy `/api` from the UI Worker.

### Deploy commands

```bash
bunx wrangler login                       # or set CLOUDFLARE_API_TOKEN in CI
bunx wrangler dev                         # local Worker + DOs
bunx wrangler deploy                      # production
bunx wrangler deploy --env staging        # optional environment
bunx wrangler secret put SESSION_SECRET   # secrets, never in wrangler.jsonc
bunx wrangler tail                        # live logs
bunx wrangler deployments list            # history
bunx wrangler rollback                    # roll back
```

Add `.dev.vars`, `.wrangler/`, and `.env*` to `.gitignore`. Never commit tokens; use
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in CI.

### Workers caveats to verify

- CPU time, request duration, WebSocket message counts, and Durable Object storage pricing
  change; check the current pricing and limits pages.
- Durable Objects are single-threaded per room; keep per-move work small (the 10×10 board is
  trivial).
- WebSocket hibernation requires the hibernation API (`state.acceptWebSocket`, handlers on
  the class), not plain `ws.accept()`.
- SSE is supported on Workers but keeps the request active; long idle streams are a worse
  fit than hibernating WebSockets. If you keep SSE, add heartbeats.
- `nodejs_compat` increases bundle size; prefer Web Crypto (`crypto.randomUUID()`) and avoid
  Node-only packages.
- Free/paid plan limits, DO availability by plan, and SQLite-backed DO class migrations
  (`new_sqlite_classes`) should be confirmed in the docs before provisioning.

---

## Option C — Realtime platform (PartyKit / Cloudflare Realtime)

If realtime is the main risk and you do not want to operate a stateful backend, move the
room actor to a managed realtime platform and keep the SvelteKit app on Cloudflare. The
`shared` rules engine still runs on the server side of the room. Trade-off: another vendor,
another deploy target, and a migration if the platform changes. Use this only if options A
and B both look worse for your timeline.

---

## CI/CD (GitHub Actions)

Current repo has no CI. Add it in **M0-7**, before deployment.

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s
          --health-timeout 3s --health-retries 20
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - run: cd packages/shared && bunx tsc --noEmit -p tsconfig.json
      - run: cd packages/shared && bun test
      - run: cd packages/app && bun run check
      - run: cd packages/app && bun run build
```

Deployment job (hybrid or native):

```yaml
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

Use a GitHub Environment with required reviewers for production. Keep a manual
`workflow_dispatch` rollback job.

---

## Production checklist

- [ ] Chosen option recorded in `PLAN.md` decisions log.
- [ ] Custom domain + HTTPS + HSTS; `Secure`, `HttpOnly`, `SameSite` cookie verified.
- [ ] No secrets in the client bundle (`PUBLIC_*` only for public values).
- [ ] `NODE_ENV=production`; structured logs without session IDs.
- [ ] Redis/DO TTL and room cleanup working; abandoned rooms expire.
- [ ] Heartbeat + reconnect + snapshot tested on a real mobile network.
- [ ] Rate limiting on room creation and join (Cloudflare WAF/rate-limit rules are enough
      for v1).
- [ ] Cloudflare/WAF bot protection does not break WebSocket upgrades.
- [ ] Health endpoint and external uptime check.
- [ ] Two-network smoke test (phone on cellular + laptop on Wi-Fi) completes a full game.
- [ ] Rollback tested once, not just documented.
- [ ] Cost alarm set (Workers/DO/Redis).

---

## Suggested references

- SvelteKit adapters: `@sveltejs/adapter-cloudflare`
- Hono on Cloudflare Workers
- Cloudflare Durable Objects: WebSocket hibernation, alarms, SQLite storage, RPC
- Wrangler: environments, secrets, migrations, `tail`, `rollback`
- Cloudflare MCP servers for docs/bindings/observability (Pi requires streamable HTTP, not
  the legacy SSE transport; verify current URLs with `pi mcp add --help` and CF docs)
