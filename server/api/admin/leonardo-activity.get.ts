import { db, schema } from 'hub:db'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const activities = await db.select()
    .from(schema.leonardoActivities)
    .orderBy(asc(schema.leonardoActivities.order))

  return {
    activities: activities.map(serializeLeonardoActivity)
  }
})
