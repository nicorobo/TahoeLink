import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sessionId } from './middleware/sessionId'
import { HTTPException } from './lib/http-error'
import { generateRoomId } from './lib/room-id'

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

/**
 * Hono onError handler — catches thrown HTTPExceptions and unexpected errors.
 * Never leaks stack traces in production.
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Use raw Response to avoid Hono's typed-status restriction
    return new Response(JSON.stringify(err.toBody()), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Unexpected error — log and return a generic message
  console.error('Unhandled error:', err)
  const isProduction = process.env.NODE_ENV === 'production'
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Internal server error' : `Internal error: ${err.message}`,
      },
    },
    500,
  )
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shared hook for Zod validation errors — returns the standard error envelope. */
const zodHook = (result: any, c: any) => {
  if (!result.success) {
    const message =
      result.error.issues?.[0]?.message ?? result.error.message ?? 'Invalid request'
    return c.json({ error: { code: 'INVALID_REQUEST', message } }, 400)
  }
}

function roomStub(env: Env['Bindings'], roomId: string): DurableObjectStub {
  const id = env.ROOMS.idFromName(roomId)
  return env.ROOMS.get(id)
}

/**
 * Forward a request to a Durable Object endpoint and return a JSON Response
 * with the same status code and content-type. Used by all DO-proxying routes.
 */
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
  // Generate a crypto-random room ID and attempt to initialize the DO.
  // Retry on collision (the DO returns 409 if the ID is already taken).
  const MAX_ATTEMPTS = 5

  for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
    const roomId = generateRoomId()
    const stub = roomStub(c.env, roomId)
    const res = await stub.fetch('http://do/init', { method: 'POST' })

    if (res.status === 200) {
      console.log(`Room ${roomId} created by ${c.get('sessionId')}`)
      return c.json({ roomId })
    }

    // 409 Conflict — ID collision, retry with a new one
    if (res.status === 409) continue

    // Unexpected error from DO — forward it
    const data = await res.json().catch(() => ({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create room' },
    }))
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // All attempts exhausted
  return c.json(
    { error: { code: 'COLLISION_RETRIES_EXCEEDED', message: 'Could not generate a unique room ID after multiple attempts' } },
    500,
  )
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
  zValidator('json', z.object({ playerId: z.number().optional() }), zodHook),
  async (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')
    const body = await c.req.valid('json')
    const stub = roomStub(c.env, roomId)
    return doFetch(stub, 'http://do/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playerId: body.playerId }),
    })
  },
)

app.post('/room/:roomId/leave', async (c) => {
  const { roomId } = c.req.param()
  const sessionId = c.get('sessionId')
  const stub = roomStub(c.env, roomId)
  return doFetch(stub, 'http://do/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
})

// ---- Game actions ---------------------------------------------------------

app.post('/room/:roomId/start', async (c) => {
  const { roomId } = c.req.param()
  const sessionId = c.get('sessionId')
  const stub = roomStub(c.env, roomId)
  return doFetch(stub, 'http://do/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
})

// All 6 playable shapes — includes Z (SZ die face allows S or Z)
const ShapeSchema = z.enum(['L', 'O', 'S', 'T', 'I', 'Z'])

app.post(
  '/room/:roomId/turn',
  zValidator(
    'json',
    z.object({
      column: z.number().int().min(0).max(9),
      shape: ShapeSchema,
      rotation: z.number().int().min(0).max(3),
      flip: z.boolean(),
    }),
    zodHook,
  ),
  async (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')
    const body = await c.req.valid('json')
    const stub = roomStub(c.env, roomId)
    return doFetch(stub, 'http://do/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...body }),
    })
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