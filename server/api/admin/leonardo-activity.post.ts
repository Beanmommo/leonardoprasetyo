import { db, schema } from 'hub:db'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { input, image } = await readActivitySubmission(event)
  const now = new Date()
  const id = crypto.randomUUID()
  const imageKey = await uploadActivityImage(event, id, image)

  try {
    // D1 batches are atomic: concurrent creates each prepend without sharing a rank.
    const [, [activity]] = await db.batch([
      db.update(schema.leonardoActivities).set({
        order: sql`${schema.leonardoActivities.order} + 1`
      }),
      db.insert(schema.leonardoActivities).values({
        id,
        imageKey,
        date: new Date(input.date),
        order: 0,
        title: input.title,
        description: input.description,
        createdAt: now,
        updatedAt: now
      }).returning()
    ])

    if (!activity) {
      throw createError({ statusCode: 500, statusMessage: 'Activity could not be created' })
    }

    setResponseStatus(event, 201)
    return { activity: serializeLeonardoActivity(activity) }
  } catch (error) {
    await deleteUnusedActivityImage(event, imageKey)
    throw error
  }
})
