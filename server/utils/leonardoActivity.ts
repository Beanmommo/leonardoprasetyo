import { z } from 'zod'
import { db } from 'hub:db'
import { formatActivityDate } from '../../shared/utils/activityDate'
import { normalizeActivityDates } from './activityDateMigration'

export async function ensureActivityDatesNormalized() {
  await normalizeActivityDates(db)
}

export const leonardoActivityInputSchema = z.object({
  date: z.iso.date(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(''),
  removeImage: z.boolean().optional().default(false)
})

export function serializeLeonardoActivity(activity: {
  id: string
  date: Date
  order: number
  title: string
  description: string
  imageKey: string | null
  createdAt: Date
  updatedAt: Date
}) {
  const { imageKey, ...entry } = activity
  return {
    ...entry,
    imageUrl: imageKey ? `/api/leonardo-activity/${activity.id}/image?v=${imageKey.split('/').at(-1)}` : null,
    // Preserve the calendar day displayed by the original timeline for older
    // timestamp-based entries. New date-only values are stored at midnight UTC.
    date: formatActivityDate(activity.date),
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString()
  }
}
