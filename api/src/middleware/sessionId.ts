import { randomUUID } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

export const sessionId: MiddlewareHandler = async (c, next) => {
    let sessionId = getCookie(c, 'session_id')

    if (!sessionId) {
        sessionId = randomUUID()
        setCookie(c, 'session_id', sessionId, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        })
    }

    c.set('sessionId', sessionId)
    await next()
}