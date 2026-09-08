import { db, schema } from 'hub:db'
import { asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { moveActivityWithinDay } from '../../../../utils/activityOrdering'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const { direction } = await readValidatedBody(event, z.object({ direction: z.enum(['up', 'down']) }).parse)

  await ensureActivityDatesNormalized()
  const changed = await db.all<{ id: string }>(moveActivityWithinDay(id, direction))
  const activities = await db.select().from(schema.leonardoActivities)
    .where(changed.length
      ? inArray(schema.leonardoActivities.id, changed.map(entry => entry.id))
      : eq(schema.leonardoActivities.id, id))
    .orderBy(asc(schema.leonardoActivities.order), asc(schema.leonardoActivities.id))

  if (!activities.some(activity => activity.id === id)) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }

  // Only the affected entries are returned; the admin merges its loaded list.
  return { activities: activities.map(serializeLeonardoActivity) }
})
