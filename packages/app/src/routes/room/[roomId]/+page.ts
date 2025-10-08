import type { PageLoad } from "./$types"
import { browser } from '$app/environment'
import type { Room } from "@tahoelink/shared"

const getDefaultBoard = () => {
    return Array(10).fill(Array(10).fill(-1))
}

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
    console.log('Response status:', res.status, res.statusText)

    if (!res.ok) throw new Error('Failed to fetch room')

    const data = await res.json() as GetRoomResponse
    return { ...data }
}