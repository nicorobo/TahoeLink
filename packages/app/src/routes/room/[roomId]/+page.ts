import { browser } from '$app/environment'
import type { PageLoad } from "./$types"
import type { Room } from "@tahoelink/shared"

export const ssr = false

interface GetRoomResponse {
    room: Room
    playerIds: number[]
    playerPosition: number
    playerId: number | null
    seats: (string | null)[]
    scores: Record<number, number>
    winner: number | null
    piecesRemaining: Record<string, Record<string, number>>
    stateVersion: number
}

export const load: PageLoad = async ({ fetch, params }) => {
    const { roomId } = params
    const apiUrl = `/api/room/${roomId}`
    try {
        const res = await fetch(apiUrl)
        if (!res.ok) {
            return { loadError: true, loadErrorMessage: `Room not found` }
        }
        const data = await res.json() as GetRoomResponse
        return { ...data, loadError: false }
    } catch (e) {
        return { loadError: true, loadErrorMessage: 'Could not connect to server' }
    }
}
