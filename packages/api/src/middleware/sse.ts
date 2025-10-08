import type { MiddlewareHandler } from 'hono'

/**
 * Middleware to set Server-Sent Events (SSE) headers
 */
export const sseHeaders: MiddlewareHandler = async (c, next) => {
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Headers', 'Cache-Control')

    await next()
}
