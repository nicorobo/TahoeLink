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

export const roomState = $state<Room & {
    stateVersion: number
    seats: (string | null)[]
    youSeat: number | null
    activeSeat: number | null
    scores: Record<number, number>
    winnerSeat: number | null
    piecesRemaining: Record<string, Record<string, number>>
}>({
    board: getDefaultBoard(),
    activePlayer: 0,
    turn: 0,
    roll: 'L',
    stage: 'waiting-for-players',
    stateVersion: 0,
    seats: [null, null, null, null],
    youSeat: null,
    activeSeat: null,
    scores: {},
    winnerSeat: null,
    piecesRemaining: {},
})

export const playerState = $state<PlayerState>({
    playerId: null,
    playerIds: [],
})

/**
 * Safely apply a partial room payload, ignoring any fields not present.
 * This prevents undefined assignment from error responses.
 */
export function applyState(payload: Partial<Room & {
  seats: (string | null)[]
  youSeat: number | null
  activeSeat: number | null
  scores: Record<number, number>
  winnerSeat: number | null
  piecesRemaining: Record<string, Record<string, number>>
  stateVersion: number
}>): void {
  if (payload.board !== undefined) roomState.board = payload.board
  if (payload.roll !== undefined) roomState.roll = payload.roll
  if (payload.turn !== undefined) roomState.turn = payload.turn
  if (payload.stage !== undefined) roomState.stage = payload.stage
  if (payload.youSeat !== undefined) roomState.youSeat = payload.youSeat
  if (payload.activeSeat !== undefined) roomState.activeSeat = payload.activeSeat
  if (payload.seats !== undefined) roomState.seats = payload.seats
  if (payload.scores !== undefined) roomState.scores = payload.scores
  if (payload.winnerSeat !== undefined) roomState.winnerSeat = payload.winnerSeat
  if (payload.piecesRemaining !== undefined) roomState.piecesRemaining = payload.piecesRemaining
  if (payload.stateVersion !== undefined) roomState.stateVersion = payload.stateVersion
}