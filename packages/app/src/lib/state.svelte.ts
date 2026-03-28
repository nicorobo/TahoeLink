import { getDefaultBoard, type Room, type Shape } from '@tahoelink/shared'
interface PieceState {
    shape: Shape,
    rotation: number,
    flip: boolean
}
export const pieceState = $state<PieceState>({
    shape: 'L',
    rotation: 0,
    flip: false,
})

interface PlayerState {
    playerId: number | null
    playerIds: number[]
}

export const roomState = $state<Room>({
    board: getDefaultBoard(),
    activePlayer: 0,
    turn: 0,
    roll: 'L',
    stage: 'waiting-for-players'
})

export const playerState = $state<PlayerState>({
    playerId: null,
    playerIds: [],
})