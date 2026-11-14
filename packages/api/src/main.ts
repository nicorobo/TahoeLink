import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sessionId } from './middleware/sessionId'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Env = {
  Variables: {
    sessionId: string
  }
  Bindings: {
    ROOMS: DurableObjectNamespace
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<Env>()
const PORT = process.env.PORT ?? 3000

app.use(cors())
app.use(sessionId)
app.use(logger())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomStub(env: Env['Bindings'], roomId: string): DurableObjectStub {
  const id = env.ROOMS.idFromName(roomId)
  return env.ROOMS.get(id)
}

/** Forward request to DO, return JSON response. */
async function doFetch(
  stub: DurableObjectStub,
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const res = await stub.fetch(url, options)
  const body = await res.json()
  return new Response(JSON.stringify(body), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withSession(sessionId: string, extra?: Record<string, string>): Record<string, string> {
  return { 'X-Session-Id': sessionId, ...extra }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/', (c) => c.text('Hello Hono!'))

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ---- Room lifecycle -------------------------------------------------------

app.post('/create-room', async (c) => {
  const roomId = Math.random().toString(36).substring(2, 15)
  const stub = roomStub(c.env, roomId)
  await stub.fetch('http://do/init', { method: 'POST' })
  console.log(`Room ${roomId} created by ${c.get('sessionId')}`)
  return c.json({ roomId })
})

app.get('/room/:roomId', async (c) => {
  const { roomId } = c.req.param()
  const sessionId = c.get('sessionId')
  const stub = roomStub(c.env, roomId)
  return doFetch(stub, `http://do/?roomId=${roomId}`, {
    headers: withSession(sessionId),
  })
})

// ---- Join / leave ---------------------------------------------------------

app.post(
  '/room/:roomId/join',
  zValidator('json', z.object({ playerId: z.number().optional() })),
  async (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')
    const body = await c.req.valid('json')

    const stub = roomStub(c.env, roomId)
    const res = await stub.fetch('http://do/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playerId: body.playerId }),
    })
    const data = await res.json()
    return c.json(data)
  },
)

app.post('/room/:roomId/leave', async (c) => {
  const { roomId } = c.req.param()
  const sessionId = c.get('sessionId')

  const stub = roomStub(c.env, roomId)
  const res = await stub.fetch('http://do/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const data = await res.json()
  return c.json(data)
})

// ---- Game actions ---------------------------------------------------------

app.post('/room/:roomId/start', async (c) => {
  const { roomId } = c.req.param()
  const sessionId = c.get('sessionId')

  const stub = roomStub(c.env, roomId)
  const res = await stub.fetch('http://do/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  const data = await res.json()
  return c.json(data)
})

const ShapeSchema = z.enum(['L', 'O', 'S', 'T', 'I'])

app.post(
  '/room/:roomId/turn',
  zValidator(
    'json',
    z.object({
      column: z.number(),
      shape: ShapeSchema,
      rotation: z.number(),
      flip: z.boolean(),
    }),
  ),
  async (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')
    const body = await c.req.valid('json')

    const stub = roomStub(c.env, roomId)
    const res = await stub.fetch('http://do/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...body }),
    })
    const data = await res.json()
    return c.json(data)
  },
)

// ---- WebSocket ------------------------------------------------------------

app.get('/ws/room/:roomId', async (c) => {
  const { roomId } = c.req.param()
  const sessionId = c.get('sessionId')
  const stub = roomStub(c.env, roomId)

  const url =
    `http://do/ws?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`
  const upgradeRes = await stub.fetch(url, {
    headers: {
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': c.req.header('Sec-WebSocket-Key') ?? '',
      'Sec-WebSocket-Version': c.req.header('Sec-WebSocket-Version') ?? '13',
      'Sec-WebSocket-Protocol': c.req.header('Sec-WebSocket-Protocol') ?? '',
    },
  })

  return upgradeRes
})

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default {
  port: PORT,
  fetch: app.fetch,
}