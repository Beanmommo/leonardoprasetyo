import { db, schema } from 'hub:db'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { activityPageQuerySchema, afterActivityCursor, decodeActivityCursor, encodeActivityCursor } from '../utils/activityPagination'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-cache')

  const query = await getValidatedQuery(event, activityPageQuerySchema.parse)
  let cursor
  try {
    cursor = query.cursor ? decodeActivityCursor(query.cursor) : undefined
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid activity cursor' })
  }
  await ensureActivityDatesNormalized()

  // Read the revision and page from the same snapshot. A reorder/date change
  // invalidates old cursors before any items from the changed ordering are sent.
  const [[state], rows] = await db.batch([
    db.select().from(schema.activityFeedState).where(eq(schema.activityFeedState.id, 1)),
    db.select().from(schema.leonardoActivities)
      .where(cursor
        ? and(
            afterActivityCursor(cursor),
            sql`(SELECT revision FROM activity_feed_state WHERE id = 1) = ${cursor.revision}`
          )
        : undefined)
      .orderBy(desc(schema.leonardoActivities.date), asc(schema.leonardoActivities.order), asc(schema.leonardoActivities.id))
      .limit(query.limit + 1)
  ])
  if (!state) throw createError({ statusCode: 500, statusMessage: 'Activity feed is not initialized' })
  if (cursor && cursor.revision !== state.revision) {
    throw createError({ statusCode: 409, statusMessage: 'Activity order changed. Refresh the timeline.' })
  }

  const activities = rows.slice(0, query.limit).map(serializeLeonardoActivity)
  const last = activities.at(-1)

  return {
    activities,
    nextCursor: rows.length > query.limit && last
      ? encodeActivityCursor({ date: last.date, order: last.order, id: last.id, revision: state.revision })
      : null
  }
})
