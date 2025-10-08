import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { sseHeaders } from './middleware/sse'
import { sessionId } from './middleware/sessionId'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getRoom, setRoom } from './models/room'
import { setPlayer, addPlayerToGame, verifyPlayer, getPositionBySessionId, getPlayerIds } from './models/players'
import { broadcastToRoom } from './broadcasting/broadcastToRoom'
import { handleRoomSSE } from './broadcasting/roomSSE'
import { getUpdatedBoard, getShape } from '@tahoelink/shared'

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

app.post('/create-room', async (c) => {
    // Generate a  short random string
    const roomId = Math.random().toString(36).substring(2, 15)
    await setRoom(roomId)
    console.log(`Room ${roomId} created by ${c.get('sessionId')}`)
    return c.json({ roomId })
})


app.post('/room/:roomId/join', zValidator('json', z.object({ playerId: z.number() })), async (c) => {
    // Ensure they haven't already joined
    // Ensure game hasn't already begun
    // Check for empty slots (players in the list with no sessionId)
    const { roomId } = c.req.param()
    const { playerId } = c.req.valid('json')
    const sessionId = c.get('sessionId')

    await setPlayer({ roomId, sessionId, playerId });
    const { turn } = await getRoom(roomId)
    if (turn > 0) {
        await addPlayerToGame({ roomId, playerId })
    }
    const playerIds = await getPlayerIds(roomId)
    broadcastToRoom(roomId, sessionId, { playerIds }, 'player-joined')
    return c.json({ playerIds })
    // Broadcast new player joined
})

app.post('/room/:roomId/start', async (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')
    await verifyPlayer({ roomId, sessionId })
    const room = await getRoom(roomId)
    const updatedRoomState = { ...room, stage: 'in-progress' as const }
    await setRoom(roomId, updatedRoomState)
    // verify we have minimum players
    broadcastToRoom(roomId, c.get('sessionId'), updatedRoomState, 'turn-start')

    return c.json(updatedRoomState)
})


const ShapeSchema = z.enum(["L", "O", "S", "T", "I"]);

app.post('/room/:roomId/turn', zValidator('json', z.object({ column: z.number(), shape: ShapeSchema, rotation: z.number(), flip: z.boolean() })), async (c) => {
    const { roomId } = c.req.param()
    const { column, shape, rotation, flip } = c.req.valid('json')
    const room = await getRoom(roomId)
    const sessionId = c.get('sessionId')

    // check that its the right player
    const position = await verifyPlayer({ roomId, sessionId })
    // check that their shape matches the dice
    // update board
    // roll dice
    // update player
    const turn = room.turn + 1
    const shapeId = position + (turn * 0.001)
    // TODO: Throw if invalid
    const board = getUpdatedBoard({ board: room.board, column, shape: getShape({ shape, rotation, flip }), shapeId })
    const updatedRoomState = { ...room, board, turn: room.turn + 1 }
    await setRoom(roomId, updatedRoomState)
    broadcastToRoom(roomId, sessionId, updatedRoomState, 'turn-start')
    return c.json(updatedRoomState)
})

app.get('/room/:roomId', async (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')
    const room = await getRoom(roomId)
    const playerIds = await getPlayerIds(roomId)
    const playerPosition = await getPositionBySessionId({ roomId, sessionId })
    const playerId = playerPosition > 0 ? playerIds[playerPosition] : null
    return c.json({
        room,
        playerIds,
        playerPosition,
        playerId
    })
})

// Consider adding a ping interval to keep the connection alive
app.get('/sse/room/:roomId', sseHeaders, (c) => {
    const { roomId } = c.req.param()
    const sessionId = c.get('sessionId')

    return streamSSE(c, (stream) => handleRoomSSE(c, stream, roomId, sessionId))
})


export default {
    port: PORT,
    fetch: app.fetch,
    idleTimeout: 0 // Required for SSE
}