export const api = {
    createRoom: async () => {
        const response = await fetch('/api/create-room', {
            method: 'POST'
        })
        return response.json()
    },
    makeMove: async (roomId: string, move: number) => {
        console.log('making move', roomId, move)
        const response = await fetch(`/api/room/${roomId}/turn`, {
            method: 'POST',
            body: JSON.stringify({ move }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
        return response.json()
    }
}