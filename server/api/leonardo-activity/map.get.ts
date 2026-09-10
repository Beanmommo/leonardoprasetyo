import { db, schema } from 'hub:db'
import { asc, desc } from 'drizzle-orm'
import { formatActivityDate } from '../../../shared/utils/activityDate'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  await ensureActivityDatesNormalized()
  const table = schema.leonardoActivities
  // Include entries beyond the current feed page without loading their bodies.
  const rows = await db.select({ id: table.id, type: table.type, title: table.title, date: table.date })
    .from(table).orderBy(desc(table.date), asc(table.order), asc(table.id))
  return { activities: rows.map(row => ({ ...row, date: formatActivityDate(row.date) })) }
})
