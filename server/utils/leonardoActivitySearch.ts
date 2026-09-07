import { z } from 'zod'
import { activityDayStart, followingActivityDate, formatActivityDate } from '../../shared/utils/activityDate.ts'

export const activitySearchSchema = z.object({
  query: z.string().trim().max(160).optional().describe('Optional literal phrase in the activity title or description. Omit to list recent activities.'),
  fromDate: z.iso.date().optional().describe('Inclusive start date, YYYY-MM-DD.'),
  toDate: z.iso.date().optional().describe('Inclusive end date, YYYY-MM-DD.'),
  limit: z.number().int().min(1).max(10).default(5).describe('Maximum activities to return, from 1 to 10.')
}).strict().refine(value => !value.fromDate || !value.toDate || value.fromDate <= value.toDate, {
  message: 'fromDate must be on or before toDate',
  path: ['toDate']
})

export type ActivitySearchInput = z.input<typeof activitySearchSchema>

/** Granite occasionally emits a JSON string containing the argument object. */
export function repairActivityToolInput(input: string): string | null {
  try {
    const decoded: unknown = JSON.parse(input)
    if (typeof decoded !== 'string') return null
    const parsed = activitySearchSchema.safeParse(JSON.parse(decoded))
    return parsed.success ? JSON.stringify(parsed.data) : null
  } catch {
    return null
  }
}

// This small interface accepts the request's D1 binding and keeps the query
// independently testable against SQLite, without a global database connection.
export interface ActivitySearchDatabase {
  prepare(query: string): {
    bind(...values: (string | number)[]): {
      all<T>(): Promise<{ results: T[] }>
    }
  }
}

interface ActivitySearchRow {
  id: string
  date: number
  title: string
  description: string
}

export async function searchLeonardoActivities(database: ActivitySearchDatabase, input: ActivitySearchInput) {
  const filters = activitySearchSchema.parse(input)
  const predicates: string[] = []
  const values: (string | number)[] = []

  if (filters.query) {
    predicates.push('instr(lower(title || \' \' || description), lower(?)) > 0')
    values.push(filters.query)
  }
  if (filters.fromDate) {
    predicates.push('date >= ?')
    values.push(activityDayStart(filters.fromDate))
  }
  if (filters.toDate) {
    predicates.push('date < ?')
    values.push(activityDayStart(followingActivityDate(filters.toDate)))
  }

  // One extra row signals truncation without claiming the result is exhaustive.
  const result = await database.prepare(`
    SELECT id, date, title, description
    FROM leonardo_activities
    ${predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''}
    ORDER BY date DESC, "order" ASC, id ASC
    LIMIT ?
  `).bind(...values, filters.limit + 1).all<ActivitySearchRow>()

  return {
    activities: result.results.slice(0, filters.limit).map(activity => ({
      id: activity.id,
      date: formatActivityDate(new Date(activity.date * 1000)),
      title: activity.title.slice(0, 120),
      description: activity.description.slice(0, 2000),
      url: `/leonardo-activity#activity-${encodeURIComponent(activity.id)}`
    })),
    hasMore: result.results.length > filters.limit,
    order: 'newest_first' as const
  }
}

export type ActivitySearchResult = Awaited<ReturnType<typeof searchLeonardoActivities>>
