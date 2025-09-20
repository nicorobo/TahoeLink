import { Hono } from 'hono'

const app = new Hono()
const PORT = process.env.PORT || 3000

app.get('/', (c) => {
    console.log('Hello Hono!')
    return c.text('Hello Hono!')
})

app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default {
    port: PORT,
    fetch: app.fetch,
}