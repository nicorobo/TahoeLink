import type { Shape } from "@tahoelink/shared"

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
    },
    // I'm thinking about making color a number, would make joining as a vacant player easier and would let allow the FE to have themes and change color scheme
    joinRoom: async ({ roomId, color }: { roomId: string, color: number }) => {
        await fetch(`/api/room/${roomId}/join`, {
            method: 'POST',
            body: JSON.stringify({ color }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
    }
}