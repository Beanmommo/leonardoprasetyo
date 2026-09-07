import { db, schema } from 'hub:db'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-cache')

  const activities = await db.select()
    .from(schema.leonardoActivities)
    .orderBy(asc(schema.leonardoActivities.order))
    .limit(100)

  return {
    activities: activities.map(serializeLeonardoActivity)
  }
})
