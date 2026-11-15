import { playerState, roomState } from "$lib/state.svelte"
import { addToast } from "$lib/toast.svelte"
import type { EventPayloadMap, EventName } from "@tahoelink/shared"

type Handler<E extends EventName> = (payload: EventPayloadMap[E]) => void

/** Track the latest state version to ignore stale messages. */
let lastStateVersion = -1

export const eventHandlers: { [K in EventName]: Handler<K> } = {
    'connected': (data) => {
        console.log('Connected to room', data.roomId, 'at version', data.stateVersion)
        lastStateVersion = data.stateVersion
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
        // Ignore stale messages with a version we have already processed
        if (data.stateVersion !== undefined) {
            if (data.stateVersion <= lastStateVersion) {
                console.log('Ignoring stale state (version', data.stateVersion, '<=', lastStateVersion, ')')
                return
            }
            lastStateVersion = data.stateVersion
        }
        roomState.stateVersion = data.stateVersion
        roomState.roll = data.roll
        roomState.turn = data.turn
        roomState.board = data.board
        roomState.stage = data.stage
        roomState.activePlayer = data.activePlayer
        roomState.seats = data.seats
        roomState.scores = data.scores
        roomState.winner = data.winner ?? null
        roomState.piecesRemaining = data.piecesRemaining
        if (data.playerPosition >= 0) {
            playerState.playerId = data.playerPosition
        }
        playerState.playerIds = data.playerIds
    }, 
    'game-over': (data) => {
        roomState.stage = 'complete'
        roomState.winner = data.winner ?? null
        roomState.scores = data.scores
        console.log('Game over! Winner:', data.winner)
    },
    'heartbeat': (data) => {
        // Connection is alive — update last known version if we fell behind
        if (data.stateVersion > lastStateVersion) {
            console.log('Heartbeat indicates missed state version', data.stateVersion, '(had', lastStateVersion, ')')
            lastStateVersion = data.stateVersion
        }
    },
    'error': (data) => {
        console.error('Server error:', data.message)
        addToast(data.message, 'error')
    },
}