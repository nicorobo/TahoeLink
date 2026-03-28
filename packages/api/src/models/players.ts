
import { redis } from '../redis'

const playersKey = (roomId: string) => `players:${roomId}`
const playerKey = (roomId: string, playerId: number | string) => `player:${roomId}:${playerId}`

interface SetPlayerArgs {
    roomId: string
    sessionId: string
    playerId: number
}
export const setPlayer = async ({ roomId, sessionId, playerId }: SetPlayerArgs) => {
    const key = playerKey(roomId, playerId)
    const player = await redis.get(key)
    // Check if sessionId is already populated on player
    // If true, add session id to player
    // If false, throw error
    if (!player) {
        await redis.set(key, sessionId)
        console.log(`Player set ${key} set to ${sessionId}`)
    } else {
        throw new Error("Player cannot be overwritten")
    }
}

interface AddPlayerToGameArgs {
    roomId: string
    playerId: number
}

export const addPlayerToGame = async ({ roomId, playerId }: AddPlayerToGameArgs) => {
    // Check if player at index already exists in players list
    // If not, add to players list
    const listKey = playersKey(roomId)
    const currentPosition = await redis.lpos(listKey, playerId)
    if (currentPosition === null) {
        return redis.rpush(listKey, playerId)
    }
    return currentPosition
}

interface UnsetPlayerArgs {
    roomId: string
    playerId: number
}
export const unsetPlayer = async ({ roomId, playerId }: UnsetPlayerArgs) => redis.del(playerKey(roomId, playerId))

interface RemovePlayerFromGameArgs {
    roomId: string
    playerId: number
}
export const removePlayerFromGame = async ({ roomId, playerId }: RemovePlayerFromGameArgs) => redis.lrem(playersKey(roomId), 0, playerId)

export const getPlayerIds = async (roomId: string): Promise<number[]> => {
    const playerIds = await redis.lrange(playersKey(roomId), 0, -1)
    return playerIds.map(Number)
}

const getPlayersByRoomId = async (roomId: string) => {
    const playerIds = await getPlayerIds(roomId)
    if (playerIds.length === 0) {
        return []
    }
    const sessionIds = await redis.mget(playerIds.map(id => playerKey(roomId, id)))
    return playerIds.map((id, i) => ({ id, sessionId: sessionIds[i] }))
}

interface GetIndexBySessionIdArgs {
    roomId: string
    sessionId: string
}
export const getPositionBySessionId = async ({ roomId, sessionId }: GetIndexBySessionIdArgs) => {
    const players = await getPlayersByRoomId(roomId)
    return players.findIndex((player) => player.sessionId === sessionId)
}

export const getPlayerIdBySessionId = async ({ roomId, sessionId }: GetIndexBySessionIdArgs) => {
    const players = await getPlayersByRoomId(roomId)
    console.log(players)
    const index = players.findIndex((player) => player.sessionId === sessionId)
    return index < 0 ? null : players[index].id
}

interface VerifyPlayerArgs {
    roomId: string
    sessionId: string
}
export const verifyPlayer = async ({ roomId, sessionId }: VerifyPlayerArgs) => {
    const playerId = await getPlayerIdBySessionId({ roomId, sessionId })
    if (playerId === null) {
        throw new Error('User is not a player')
    }
    return playerId;
}