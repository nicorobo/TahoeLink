import { type Context } from 'hono'
import { type SSEStreamingApi } from 'hono/streaming'
import { broadcastToRoom } from './broadcastToRoom'
import { sendEvent } from './events'
import { EVENT_NAMES } from '@tahoelink/shared'

type Client = {
    stream: SSEStreamingApi
    sessionId: string
    connectedAt: Date
}

const createClient = (stream: SSEStreamingApi, sessionId: string): Client => {
    return { stream, sessionId, connectedAt: new Date() }
}

export const roomClients: Map<string, Set<Client>> = new Map()

export const handleRoomSSE = async (
    c: Context,
    stream: SSEStreamingApi,
    roomId: string,
    sessionId: string
) => {
    const roomStreams = getOrCreateRoomStreams(roomId)
    const client = createClient(stream, sessionId)
    roomStreams.add(client)

    console.log(`Client connected to room ${roomId}. Total clients: ${roomStreams.size}`)

    try {
        await sendInitialConnection(stream)
        broadcastConnection(roomId, sessionId)

        await keepConnectionAlive(c, stream, roomId, client)
    } catch (error) {
        console.error('Error in SSE stream:', error)
        cleanupClient(roomId, client)
        throw error
    }
}

function getOrCreateRoomStreams(roomId: string): Set<Client> {
    if (!roomClients.has(roomId)) {
        roomClients.set(roomId, new Set())
    }
    return roomClients.get(roomId)!
}

async function sendInitialConnection(stream: SSEStreamingApi) {
    await sendEvent(stream, EVENT_NAMES.connected)
}

function broadcastConnection(roomId: string, sessionId: string) {
    broadcastToRoom(roomId, sessionId, { message: `${sessionId} connected to room` }, EVENT_NAMES.participantChange)
}

async function keepConnectionAlive(
    c: Context,
    stream: SSEStreamingApi,
    roomId: string,
    client: Client
): Promise<void> {
    return new Promise((resolve) => {
        const cleanup = () => {
            cleanupClient(roomId, client)
            console.log(`Client disconnected from room ${roomId}`)
            resolve()
        }

        // Handle both abort and close events
        c.req.raw.signal?.addEventListener('abort', cleanup)
        stream.onAbort = cleanup
    })
}

function cleanupClient(roomId: string, client: Client) {
    const roomStreams = roomClients.get(roomId)
    if (!roomStreams) return

    roomStreams.delete(client)
    if (roomStreams.size === 0) {
        roomClients.delete(roomId)
    }
}