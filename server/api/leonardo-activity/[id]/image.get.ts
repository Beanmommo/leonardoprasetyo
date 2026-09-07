import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const activity = await db.query.leonardoActivities.findFirst({
    where: eq(schema.leonardoActivities.id, id),
    columns: { imageKey: true }
  })
  const object = activity?.imageKey
    ? await requireCloudflareBinding(event, 'BLOB').get(activity.imageKey)
    : null
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Activity picture not found' })

  const headers = new Headers({
    'Content-Type': 'image/jpeg',
    'Content-Length': String(object.size),
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'ETag': object.httpEtag,
    'X-Content-Type-Options': 'nosniff'
  })
  if (getRequestHeader(event, 'if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(object.body, { headers })
})
