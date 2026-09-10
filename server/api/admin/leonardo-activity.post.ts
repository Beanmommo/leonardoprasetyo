import { db, schema } from 'hub:db'
import { firstActivityOrder } from '../../utils/activityOrdering'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { input, image } = await readActivitySubmission(event)
  await ensureActivityDatesNormalized()
  const now = new Date()
  const id = crypto.randomUUID()
  const imageKey = await uploadActivityImage(event, id, image)

  try {
    const [activity] = await db.insert(schema.leonardoActivities).values({
      id,
      type: input.type ?? 'activity',
      contentMarkdown: input.contentMarkdown || null,
      imageKey,
      date: new Date(input.date),
      order: firstActivityOrder(input.date),
      title: input.title,
      description: input.description,
      createdAt: now,
      updatedAt: now
    }).returning()

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
