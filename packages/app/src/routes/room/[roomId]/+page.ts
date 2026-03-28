import { API_BASE } from "$lib/api"
import type { PageLoad } from "./$types"
import type { Room } from "@tahoelink/shared"

interface GetRoomResponse {
    room: Room
    playerIds: number[]
    playerPosition: number
    playerId: number | null
}

export const load: PageLoad = async ({ fetch, params }) => {
    const { roomId } = params
    const apiUrl = `${API_BASE}/room/${roomId}`
    const res = await fetch(apiUrl)
    const data = await res.json() as GetRoomResponse
    return { ...data }
}