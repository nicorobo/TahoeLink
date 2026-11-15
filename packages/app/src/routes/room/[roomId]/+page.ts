import type { Board, DiceValue, RoomStage } from '@tahoelink/shared'
import type { PageLoad } from "./$types"

export const ssr = false

interface GetRoomResponse {
    board: Board
    seats: (string | null)[]
    youSeat: number | null
    activeSeat: number | null
    turn: number
    roll: DiceValue
    stage: RoomStage
    scores: Record<number, number>
    winnerSeat: number | null
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
