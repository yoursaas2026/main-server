import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

const welcomeStrings = [
  "Hello Hono!",
  "Message from YourSaaS",
]

app.get('/', (c) => {
  return c.text(welcomeStrings.join('\n\n'))
})

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})

export default app
