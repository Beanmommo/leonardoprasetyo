import { sql } from 'drizzle-orm'
import { z } from 'zod'

export const activityPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional()
})

const activityCursorSchema = z.object({
  v: z.literal(1),
  date: z.iso.date(),
  order: z.number().int().safe(),
  id: z.string().uuid(),
  revision: z.number().int().nonnegative().safe()
}).strict()

export type ActivityCursor = z.infer<typeof activityCursorSchema>

export function encodeActivityCursor(cursor: Omit<ActivityCursor, 'v'>): string {
  return btoa(JSON.stringify(activityCursorSchema.parse({ ...cursor, v: 1 })))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeActivityCursor(cursor: string): ActivityCursor {
  return activityCursorSchema.parse(JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))))
}

export function afterActivityCursor(cursor: ActivityCursor) {
  const date = Date.parse(`${cursor.date}T00:00:00Z`) / 1000
  // Date is descending, while order and id are ascending. The leading bound
  // lets SQLite seek into the composite index before checking the same-day tail.
  return sql`"date" <= ${date} AND (
    "date" < ${date}
    OR ("date" = ${date} AND ("order", "id") > (${cursor.order}, ${cursor.id}))
  )`
}
