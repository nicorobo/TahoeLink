// Workers entry point — wraps the Hono app and exports the DO class for wrangler.
import app from './main'
import { RoomDurableObject } from './durable-objects/room-do'

// Named export — wrangler discovers this for Durable Object bindings
export { RoomDurableObject }

// Default export — Workers fetch handler (Hono)
export default {
  fetch: app.fetch,
}