import type { Shape } from "./types"

export const api = {
    createRoom: async () => {
        const response = await fetch('/api/create-room', {
            method: 'POST'
        })
        return response.json()
    },
    makeMove: async ({ roomId, column, shape, rotation, flip }: { roomId: string, column: number, shape: Shape, rotation: number, flip: boolean }) => {
        console.log('making move', { roomId, column, shape, rotation, flip })
        const response = await fetch(`/api/room/${roomId}/turn`, {
            method: 'POST',
            body: JSON.stringify({ column, shape, rotation, flip }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
        return response.json()
    }
}