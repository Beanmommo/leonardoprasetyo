import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const { input, image } = await readActivitySubmission(event)
  const existing = await db.query.leonardoActivities.findFirst({
    where: eq(schema.leonardoActivities.id, id),
    columns: { id: true }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  const imageKey = await uploadActivityImage(event, id, image)

  try {
    // Capture the replaced key in the same transaction as the update, including
    // when another edit changed the picture while this upload was in flight.
    const [[previous], [activity]] = await db.batch([
      db.select({ imageKey: schema.leonardoActivities.imageKey })
        .from(schema.leonardoActivities).where(eq(schema.leonardoActivities.id, id)),
      db.update(schema.leonardoActivities).set({
        date: new Date(input.date),
        title: input.title,
        description: input.description,
        imageKey: input.removeImage ? null : imageKey,
        updatedAt: new Date()
      }).where(eq(schema.leonardoActivities.id, id)).returning()
    ])

    if (!activity) {
      throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
    }

    if (previous?.imageKey !== activity.imageKey) {
      await deleteUnusedActivityImage(event, previous?.imageKey)
    }
    return { activity: serializeLeonardoActivity(activity) }
  } catch (error) {
    await deleteUnusedActivityImage(event, imageKey)
    throw error
  }
})
