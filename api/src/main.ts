import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'
import { sseHeaders } from './middleware/sse'
import { sessionId } from './middleware/sessionId'
import { redis } from './redis'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getShape } from './getShape'
import { getNewBoard } from './getNewBoard'
import { BOARD_HEIGHT, BOARD_WIDTH } from './constants'

type Variables = {
    sessionId: string
}

const app = new Hono<{ Variables: Variables }>()
const PORT = process.env.PORT || 3000

app.use(sessionId)
app.use(logger())

app.get('/', (c) => {
    console.log('Hello Hono!')
    return c.text('Hello Hono!')
})

app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/rooms', async (c) => {
    const keys = await redis.keys('room:*')
    const rooms = await Promise.all(
        keys.map(key => redis.hgetall(key))
    )
    return c.json({ rooms })
})

app.post('/create-room', async (c) => {
    // Generate a  short random string
    const roomId = Math.random().toString(36).substring(2, 15)
    await redis.hmset(`room:${roomId}`, [
        'status', 'active',
        'createdAt', new Date().toISOString(),
        'createdBy', c.get('sessionId'),
    ])
    console.log(`Room ${roomId} created by ${c.get('sessionId')}`)
    return c.json({ roomId })
})

const getDefaultGameState = () => {
    return Array(BOARD_WIDTH).fill(Array(BOARD_HEIGHT).fill(-1))
}
const getGameStateKey = (roomId: string) => {
    return `room:${roomId}:state`
}
const getGameState = async (roomId: string): Promise<number[][]> => {
    const key = getGameStateKey(roomId)
    const state = await redis.get(key)
    if (!state) {
        return getDefaultGameState()
    }
    return JSON.parse(state)
}

const setGameState = async (roomId: string, state: number[][]) => {
    const key = getGameStateKey(roomId)
    await redis.set(key, JSON.stringify(state))
}
const ShapeSchema = z.enum(["L", "O", "S", "T", "I"]);
app.post('/room/:roomId/turn', zValidator('json', z.object({ column: z.number(), shape: ShapeSchema, rotation: z.number(), flip: z.boolean() })), async (c) => {
    const { roomId } = c.req.param()
    const { column, shape, rotation, flip } = c.req.valid('json')
    const theShape = getShape({ shape, rotation, flip })
    const currentBoard = await getGameState(roomId)
    // Make move
    const board = getNewBoard({ currentBoard, column, shape: theShape, turnId: 1.01 })
    // Throws if invalid
    await setGameState(roomId, board)
    broadcastToRoom(roomId, c.get('sessionId'), { board }, 'turn')
    return c.json({ board: board })
})

app.get('/room/:roomId', async (c) => {
    const { roomId } = c.req.param()
    const state = await getGameState(roomId)
    return c.json({ board: state })
})

// Store SSE streams by roomId
type Client = {
    stream: SSEStreamingApi
    sessionId: string
    connectedAt: Date
}
const createClient = (stream: SSEStreamingApi, sessionId: string): Client => {
    return { stream, sessionId, connectedAt: new Date() }
}
const roomClients: Map<string, Set<Client>> = new Map()

let id = 0
// Consider adding a ping interval to keep the connection alive
app.get('/sse/room/:roomId', sseHeaders, (c) => {
    const { roomId } = c.req.param()

    const sessionId = c.get('sessionId')

    return streamSSE(c, async (stream) => {
        // Get or create the Set for this room
        if (!roomClients.has(roomId)) {
            roomClients.set(roomId, new Set())
        }
        const roomStreams = roomClients.get(roomId)!

        // Add this stream to the room's client set
        const client = createClient(stream, sessionId)
        roomStreams.add(client)
        console.log(`Client connected to room ${roomId}. Total clients: ${roomStreams.size}`)

        try {
            // Send initial connection message
            await stream.writeSSE({
                data: JSON.stringify({ message: 'Connected to room', roomId }),
                event: 'connected',
                id: String(id++),
            })

            broadcastToRoom(roomId, sessionId, { message: `${sessionId} connected to room` }, 'new-connection')

            // Keep the connection open - this function should not return
            // The connection will be cleaned up when the client disconnects
            return new Promise<void>((resolve) => {
                // Handle client disconnect
                const cleanup = () => {
                    console.log(`Client disconnected from room ${roomId}`)
                    roomStreams.delete(client)
                    if (roomStreams.size === 0) {
                        roomClients.delete(roomId)
                    }
                    resolve()
                }

                // Listen for abort signal
                c.req.raw.signal?.addEventListener('abort', cleanup)

                // Also handle connection close
                stream.onAbort = cleanup
            })
        } catch (error) {
            console.error('Error in SSE stream:', error)
            roomStreams.delete(client)
            throw error
        }
    })
})

// Helper function to broadcast a message to all clients in a room
function broadcastToRoom(roomId: string, sessionId: string, data: any, event: string = 'message') {
    const roomStreams = roomClients.get(roomId)
    if (roomStreams) {
        console.log(`Broadcasting to room ${roomId}, ${roomStreams.size} clients. From ${sessionId}`)
        roomStreams.forEach(async (client) => {
            console.log(`Broadcasting to client ${client.sessionId}`)
            if (client.sessionId === sessionId) {
                return
            }
            try {
                await client.stream.writeSSE({
                    data: JSON.stringify(data),
                    event,
                    id: String(id++),
                })
            } catch (error) {
                console.error('Error sending message to client:', error)
                // Remove failed streams
                roomStreams.delete(client)
            }
        })
    }
}

export default {
    port: PORT,
    fetch: app.fetch,
    idleTimeout: 0
}