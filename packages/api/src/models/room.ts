
import { redis } from '../redis'
import type { Room, DiceValue } from '@tahoelink/shared'
import { BOARD_HEIGHT, BOARD_WIDTH } from '@tahoelink/shared'

interface SerializedRoom extends Omit<Room, 'board' | 'activePlayer'> {
    board: string
    activePlayer: string
}

const roomKey = (roomId: string) => `room:${roomId}`

const getDefaultBoard = () =>
    Array.from({ length: BOARD_WIDTH }, () =>
        Array.from({ length: BOARD_HEIGHT }, () => -1)
    )

// Should we add createdAt? or gameStartedAt?
const getDefaultRoom = (): Room => ({
    board: getDefaultBoard(),
    activePlayer: 0,
    turn: 0,
    roll: 'I',
    stage: 'waiting-for-players'
})

const serializeRoom = (room: Room): SerializedRoom => ({ ...room, board: JSON.stringify(room.board), activePlayer: room.activePlayer.toString() })
const deserializeRoom = (room: SerializedRoom): Room => ({
    board: JSON.parse(room.board),
    activePlayer: Number(room.activePlayer),
    turn: Number(room.turn),
    roll: room.roll as DiceValue,
    stage: room.stage as Room['stage']
})

export const getRoom = async (roomId: string): Promise<Room> => {
    const key = roomKey(roomId)
    const raw = (await redis.hgetall(key))
    if (!raw || Object.keys(raw).length === 0) {
        return getDefaultRoom()
    }
    return deserializeRoom(raw as unknown as SerializedRoom)
}

// TODO: Investigate partial writes
export const setRoom = async (roomId: string, room?: Room) => {
    const key = roomKey(roomId)
    await redis.hset(key, serializeRoom(room ?? getDefaultRoom()))
}