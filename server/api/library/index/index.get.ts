import { db, schema } from 'hub:db'
import { and, count, eq, isNotNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const vectorize = requireCloudflareBinding(event, 'VECTORIZE')
  const config = getCloudflareConfig(event)
  const [description, upload] = await Promise.all([
    vectorize.describe(),
    db.query.uploads.findFirst({
      where: () => and(
        eq(schema.uploads.isPublic, true),
        eq(schema.uploads.isActive, true),
        eq(schema.uploads.status, 'ready'),
        isNotNull(schema.uploads.ingestionId)
      )
    })
  ])
  const [publishedCount] = upload?.ingestionId
    ? await db.select({ value: count() }).from(schema.documentChunks).where(and(
        eq(schema.documentChunks.uploadId, upload.id),
        eq(schema.documentChunks.ingestionId, upload.ingestionId)
      ))
    : []

  return {
    index: {
      name: config.vectorizeIndexName,
      dimensions: description.dimensions,
      metric: config.vectorizeMetric,
      vectorCount: publishedCount?.value || 0,
      processedUpToDatetime: description.processedUpToDatetime || null,
      processedUpToMutation: description.processedUpToMutation || null,
      embeddingModel: config.embeddingModel
    }
  }
})
