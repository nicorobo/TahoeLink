export const api = {
    createRoom: async () => {
        const response = await fetch('/api/create-room')
        return response.json()
    },
    joinRoom: async (roomId: string) => {
        const response = await fetch(`/api/join-room/${roomId}`)
        return response.json()
    }
}