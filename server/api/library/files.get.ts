import { db, schema } from 'hub:db'
import { and, count, desc, eq, isNotNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const bucket = requireCloudflareBinding(event, 'BLOB')
  const uploads = await db.query.uploads.findMany({
    where: () => and(
      eq(schema.uploads.isPublic, true),
      eq(schema.uploads.isActive, true),
      eq(schema.uploads.status, 'ready'),
      isNotNull(schema.uploads.ingestionId)
    ),
    orderBy: () => desc(schema.uploads.indexedAt),
    limit: 20
  })

  const files = await Promise.all(uploads.map(async (upload) => {
    const [object, countRow] = await Promise.all([
      bucket.head(upload.r2Key),
      db.select({ value: count() }).from(schema.documentChunks)
        .where(and(
          eq(schema.documentChunks.uploadId, upload.id),
          eq(schema.documentChunks.ingestionId, upload.ingestionId!)
        ))
        .then(rows => rows[0])
    ])
    return serializeLibraryFile(upload, object, countRow?.value || 0)
  }))

  return { files }
})
