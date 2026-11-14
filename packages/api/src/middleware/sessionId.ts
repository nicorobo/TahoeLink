// Use Web Crypto API (compatible with Workers)
// crypto.randomUUID() is available in modern runtimes
import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

export const sessionId: MiddlewareHandler = async (c, next) => {
    let sessionId = getCookie(c, 'session_id')

    if (!sessionId) {
        sessionId = crypto.randomUUID()

        // Derive Secure flag from X-Forwarded-Proto or env override
        const proto = c.req.header('x-forwarded-proto')
        const envOverride = process.env.COOKIE_SECURE
        const secure = envOverride === 'true' || (envOverride !== 'false' && proto === 'https')

        setCookie(c, 'session_id', sessionId, {
            httpOnly: true,
            secure,
            sameSite: 'Strict',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        })
    }

    c.set('sessionId', sessionId)
    await next()
}