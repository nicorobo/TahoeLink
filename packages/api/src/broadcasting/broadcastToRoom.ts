import { sendEvent } from "./events"
import { roomClients } from "./roomSSE"
import type { EventName } from '@tahoelink/shared'

// Helper function to broadcast a message to all clients in a room
export function broadcastToRoom(roomId: string, sessionId: string, data: any, event: EventName) {
    const roomStreams = roomClients.get(roomId)
    if (roomStreams) {
        console.log(`Broadcasting to room ${roomId}, ${roomStreams.size} clients. From ${sessionId}`)
        roomStreams.forEach(async (client) => {
            console.log(`Broadcasting to client ${client.sessionId}`)
            if (client.sessionId === sessionId) {
                return
            }
            try {
                await sendEvent(client.stream, event, data)
            } catch (error) {
                console.error('Error sending message to client:', error)
                // Remove failed streams
                roomStreams.delete(client)
            }
        })
    }
}