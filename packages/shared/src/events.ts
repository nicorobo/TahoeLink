import type { Board, DiceValue, RoomStage, Room } from "./types"

export type ConnectedPayload = {
    roomId: string
    stateVersion: number
}

/** Full state snapshot sent on WebSocket connect and after mutations. */
export type StatePayload = Room & {
    seats: (string | null)[]
    playerIds: number[]
    playerPosition: number
    playerId: number | null
    scores: Record<number, number>
    winner: number | null
    piecesRemaining: Record<string, Record<string, number>>
    stateVersion: number
}

export type TurnStartPayload = {
    board: Board
    activePlayer: number
    turn: number
    roll: DiceValue
    stage: RoomStage
}

export type PlayerJoinedPayload = {
    playerIds: number[]
}

export type PlayerLeftPayload = {
    playerIds: number[]
}

export type GameOverPayload = {
    winner: number | null
    scores: Record<number, number>
}

export type HeartbeatPayload = {
    stateVersion: number
}

export type ErrorPayload = {
    code: string
    message: string
}

// Central mapping of all event types to payloads
export interface EventPayloadMap {
    'connected': ConnectedPayload
    'state': StatePayload
    'turn-start': TurnStartPayload
    'player-joined': PlayerJoinedPayload
    'player-left': PlayerLeftPayload
    'game-over': GameOverPayload
    'heartbeat': HeartbeatPayload
    'error': ErrorPayload
}

// Helper type for union of event names
export type EventName = keyof EventPayloadMap