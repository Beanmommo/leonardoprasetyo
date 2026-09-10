import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const activity = await db.query.leonardoActivities.findFirst({
    where: and(eq(schema.leonardoActivities.id, id), eq(schema.leonardoActivities.type, 'milestone'))
  })
  if (!activity) throw createError({ statusCode: 404, statusMessage: 'Milestone not found' })
  return { activity: serializeLeonardoActivity(activity) }
})
