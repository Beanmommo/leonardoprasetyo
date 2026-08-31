import { db, schema } from 'hub:db'
import { count, desc, eq, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const bucket = requireCloudflareBinding(event, 'BLOB')
  const uploads = await db.query.uploads.findMany({
    where: () => ne(schema.uploads.status, 'deleted'),
    orderBy: () => desc(schema.uploads.updatedAt),
    limit: 100
  })

  const files = await Promise.all(uploads.map(async (upload) => {
    const [object, countRow] = await Promise.all([
      bucket.head(upload.r2Key),
      db.select({ value: count() }).from(schema.documentChunks)
        .where(eq(schema.documentChunks.uploadId, upload.id))
        .then(rows => rows[0])
    ])
    return {
      ...serializeLibraryFile(upload, object, countRow?.value || 0),
      contentUrl: `/api/admin/library/files/${upload.id}/content`
    }
  }))

  return { files }
})
