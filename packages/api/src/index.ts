// Workers entry point — wraps the Hono app for Cloudflare Workers / wrangler dev.
import app from './main'

export default {
  fetch: app.fetch
}
