import { browser } from '$app/environment'
import type { PageLoad } from "./$types"
import type { Room } from "@tahoelink/shared"

export const ssr = false

interface GetRoomResponse {
    room: Room
    playerIds: number[]
    playerPosition: number
    playerId: number | null
}

export const load: PageLoad = async ({ fetch, params }) => {
    const { roomId } = params
    const apiUrl = `/api/room/${roomId}`
    const res = await fetch(apiUrl)
    const data = await res.json() as GetRoomResponse
    return { ...data }
}
