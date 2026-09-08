import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)

  const [activity] = await db.delete(schema.leonardoActivities)
    .where(eq(schema.leonardoActivities.id, id))
    .returning({ id: schema.leonardoActivities.id, imageKey: schema.leonardoActivities.imageKey })

  if (!activity) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }

  await deleteUnusedActivityImage(event, activity.imageKey)
  return { deletedId: activity.id }
})
