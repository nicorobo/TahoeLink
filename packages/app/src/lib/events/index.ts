import { playerState, roomState } from "$lib/state.svelte"
import type { EventPayloadMap, EventName } from "@tahoelink/shared"

type Handler<E extends EventName> = (payload: EventPayloadMap[E]) => void

export const eventHandlers: { [K in EventName]: Handler<K> } = {
    'connected': (data) => {
        console.log('Connected to room', data.roomId)
    },
    'turn-start': (data) => {
        roomState.roll = data.roll
        roomState.turn = data.turn
        roomState.board = data.board
        roomState.stage = data.stage
    },
    'player-joined': (data) => {
        playerState.playerIds = data.playerIds
    },
    'player-left': (data) => {
        playerState.playerIds = data.playerIds
    },
    'state': (data) => {
        roomState.roll = data.roll
        roomState.turn = data.turn
        roomState.board = data.board
        roomState.stage = data.stage
        roomState.activePlayer = data.activePlayer
        if (data.playerPosition >= 0) {
            playerState.playerId = data.playerPosition
        }
        playerState.playerIds = data.playerIds
    },
    'game-over': (data) => {
        roomState.stage = 'complete'
        console.log('Game over! Winner:', data.winner)
    },
    'error': (data) => {
        console.error('Server error:', data.message)
    },
}