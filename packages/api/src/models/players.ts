
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
    const inPlay = await redis.lpos(listKey, playerId)
    if (inPlay === null) {
        await redis.rpush(listKey, playerId)
    }
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
export const removePlayerFromGame = async ({ roomId, playerId }: RemovePlayerFromGameArgs) => redis.lrem(playersKey(roomId), 0, playerKey(roomId, playerId))

export const getPlayerIds = async (roomId: string): Promise<number[]> => {
    const playerIds = await redis.lrange(playersKey(roomId), 0, -1)
    return playerIds.map(Number)
}

interface GetIndexBySessionIdArgs {
    roomId: string
    sessionId: string
}
export const getPositionBySessionId = async ({ roomId, sessionId }: GetIndexBySessionIdArgs) => {
    const playerIds = await getPlayerIds(roomId)
    const sessionIds = await redis.mget(playerIds.map(id => playerKey(roomId, id)))
    return sessionIds.findIndex(id => id === sessionId)
}

interface VerifyPlayerArgs {
    roomId: string
    sessionId: string
}
export const verifyPlayer = async ({ roomId, sessionId }: VerifyPlayerArgs) => {
    const index = await getPositionBySessionId({ roomId, sessionId })
    if (index < 0) {
        throw new Error('User is not a player')
    }
    return index;
}