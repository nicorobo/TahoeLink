// Set up redis connection
import Redis from 'ioredis'
export const redis = new Redis({
    host: process.env.REDIS_HOST ?? 'redis',
    port: 6379
})