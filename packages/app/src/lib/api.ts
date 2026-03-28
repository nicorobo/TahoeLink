import type { Shape } from "@tahoelink/shared"
import { browser } from '$app/environment';

export const API_BASE = browser ? '/api' : 'http://api:3000';

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