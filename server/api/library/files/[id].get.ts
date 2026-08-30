import { db, schema } from 'hub:db'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const upload = await db.query.uploads.findFirst({
    where: () => and(
      eq(schema.uploads.id, id),
      eq(schema.uploads.isPublic, true),
      ne(schema.uploads.status, 'deleted')
    )
  })
  if (!upload) {
    throw createError({ statusCode: 404, statusMessage: 'Library file not found' })
  }

  const bucket = requireCloudflareBinding(event, 'BLOB')
  const activeIngestionId = upload.isActive && upload.status === 'ready'
    ? upload.ingestionId
    : null
  const [object, countRows] = await Promise.all([
    bucket.head(upload.r2Key),
    activeIngestionId
      ? db.select({ value: count() }).from(schema.documentChunks)
          .where(and(
            eq(schema.documentChunks.uploadId, upload.id),
            eq(schema.documentChunks.ingestionId, activeIngestionId)
          ))
      : Promise.resolve([])
  ])

  return { file: serializeLibraryFile(upload, object, countRows[0]?.value || 0) }
})
