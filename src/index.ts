import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { db } from './db/index.js'
import { developers, clients, admins } from './db/schema.js'
import { sql } from 'drizzle-orm'

const app = new Hono()

app.get('/', async (c) => {
  try {

    // Option 2: List all tables in PostgreSQL (if you want to see tables)
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    return c.json({
      message: "Message from YourSaaS",
      databaseStatus: "Connected successfully ✅",
      tablesInDatabase: tables
    })
  } catch (err) {
    return c.json({
      message: "Message from YourSaaS",
      error: "Database not connected or configured properly",
      details: err instanceof Error ? err.message : String(err)
    })
  }
})

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})

export default app
