import type { Shape } from "@tahoelink/shared"

// Room page uses ssr = false, so API_BASE is always /api (proxied by Vite).
// Override via PUBLIC_API_BASE env var for split deployments.
export const API_BASE = import.meta.env.PUBLIC_API_BASE ?? '/api';

export const api = {
    createRoom: async () => {
        const response = await fetch(`${API_BASE}/create-room`, {
            method: 'POST'
        })
        return response.json()
    },
    joinRoom: async ({ roomId, playerId }: { roomId: string, playerId: number }) => {
        const response = await fetch(`${API_BASE}/room/${roomId}/join`, {
            method: 'POST',
            body: JSON.stringify({ playerId }),
            headers: {
                'Content-Type': 'application/json'
            }
        })

        return response.json()
    },
    leaveRoom: async ({ roomId }: { roomId: string }) => {
        const response = await fetch(`${API_BASE}/room/${roomId}/leave`, {
            method: 'POST'
        })

        return response.json()
    },
    startGame: async ({ roomId }: { roomId: string }) => {
        const response = await fetch(`${API_BASE}/room/${roomId}/start`, {
            method: 'POST'
        })

        return response.json()
    },
    makeMove: async ({ roomId, column, shape, rotation, flip }: { roomId: string, column: number, shape: Shape, rotation: number, flip: boolean }) => {
        console.log('making move', { roomId, column, shape, rotation, flip })
        const response = await fetch(`${API_BASE}/room/${roomId}/turn`, {
            method: 'POST',
            body: JSON.stringify({ column, shape, rotation, flip }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
        return response.json()
    },
}