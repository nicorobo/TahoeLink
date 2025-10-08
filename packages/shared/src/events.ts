export type ConnectedPayload = {
    roomId: string
}

export type TurnStartPayload = {
    playerId: number
    turnNumber: number
}

export type PlayerJoinedPayload = {
    playerIds: number[]
}

export type PlayerLeftPayload = {
    playerIds: number[]
}

export type ParticipantChangePayload = {
    participants: string[]
}

// Central mapping of all event types to payloads
export interface EventPayloadMap {
    'connected': ConnectedPayload
    'turn-start': TurnStartPayload
    'player-joined': PlayerJoinedPayload
    'player-left': PlayerLeftPayload
    'participant-change': ParticipantChangePayload
}

// Helper type for union of event names
export type EventName = keyof EventPayloadMap