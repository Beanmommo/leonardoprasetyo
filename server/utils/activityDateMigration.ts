import type { db } from 'hub:db'
import * as schema from '../db/schema.ts'
import { and, eq, sql } from 'drizzle-orm'
import { formatActivityDate } from '../../shared/utils/activityDate.ts'

/**
 * Complete the SQL migration using the runtime's IANA timezone database, which
 * SQLite lacks. Only legacy timestamps need conversion; UTC-midnight dates
 * already display on the same Melbourne day. Bounded, conditional batches make
 * this resumable and safe alongside another request doing the same backfill.
 */
export async function normalizeActivityDates(database: typeof db) {
  const state = await database.query.activityFeedState.findFirst({
    where: eq(schema.activityFeedState.id, 1)
  })
  if (!state) throw new Error('Activity feed migration has not been applied')
  if (state.datesNormalized) return

  while (true) {
    const entries = await database.select({ id: schema.leonardoActivities.id, date: schema.leonardoActivities.date })
      .from(schema.leonardoActivities)
      .where(sql`${schema.leonardoActivities.date} % 86400 <> 0`)
      .limit(50)
    if (!entries.length) break

    const updates = entries.map(entry => database.update(schema.leonardoActivities)
      .set({ date: new Date(`${formatActivityDate(entry.date)}T00:00:00Z`) })
      .where(and(eq(schema.leonardoActivities.id, entry.id), eq(schema.leonardoActivities.date, entry.date))))
    const [first, ...rest] = updates
    if (first) await database.batch([first, ...rest])
  }

  await database.update(schema.activityFeedState).set({ datesNormalized: true })
    .where(eq(schema.activityFeedState.id, 1))
}
