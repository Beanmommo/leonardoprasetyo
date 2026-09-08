import { db, schema } from 'hub:db'
import { asc, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  await ensureActivityDatesNormalized()

  const activities = await db.select()
    .from(schema.leonardoActivities)
    .orderBy(desc(schema.leonardoActivities.date), asc(schema.leonardoActivities.order), asc(schema.leonardoActivities.id))

  return {
    activities: activities.map(serializeLeonardoActivity)
  }
})
