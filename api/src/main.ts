import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { randomUUID } from 'node:crypto'

type Variables = {
    sessionId: string
}

const app = new Hono<{ Variables: Variables }>()
const PORT = process.env.PORT || 3000

app.use('*', async (c, next) => {
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
})

app.get('/', (c) => {
    console.log('Hello Hono!')
    return c.text('Hello Hono!')
})

app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/create-room', (c) => {
    // Generate a  short random string
    const roomId = Math.random().toString(36).substring(2, 15)
    return c.json({ roomId })
})

app.get('/join-room/:roomId', (c) => {
    const roomId = c.req.param('roomId')
    return c.json({ roomId })
})

export default {
    port: PORT,
    fetch: app.fetch,
}