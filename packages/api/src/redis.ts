// Lazy Redis connection — avoids module-scope connection in Workers.
// The connection is created on first use. For Wrangler dev, set REDIS_HOST=localhost
// (or omit to use the default) and ensure Redis is running.

import Redis from 'ioredis'

let _redis: Redis | null = null

function getRedis(): Redis {
    if (!_redis) {
        _redis = new Redis({
            host: process.env.REDIS_HOST ?? 'localhost',
            port: 6379,
            lazyConnect: false,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null // do not retry — fail fast
        })
    }
    return _redis
}

export const redis = new Proxy({} as Redis, {
    get(_target, prop) {
        return (...args: unknown[]) => (getRedis() as any)[prop](...args)
    }
})
