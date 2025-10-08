import type { EventPayloadMap, EventName } from "@tahoelink/shared"

type Handler<E extends EventName> = (payload: EventPayloadMap[E]) => void

export const eventHandlers: { [K in EventName]: Handler<K> } = {
    'connected': (data) => {
        console.log('Connected to room', data.roomId)
    },
    'turn-start': (data) => {
        console.log('Turn made by', data.playerId, 'Turn #', data.turnNumber)
    },
    'player-joined': (data) => {
        console.log('Player joined')
    },
    'player-left': (data) => {
        console.log('Player left')
    },
    'participant-change': (data) => {
        console.log('Participants changed:', data.participants)
    },
}