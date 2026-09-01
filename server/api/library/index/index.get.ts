import { db, schema } from 'hub:db'
import { and, count, eq, isNotNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const vectorize = requireCloudflareBinding(event, 'VECTORIZE')
  const config = getCloudflareConfig(event)
  const [description, publishedRows] = await Promise.all([
    vectorize.describe(),
    db.select({ value: count() })
      .from(schema.documentChunks)
      .innerJoin(schema.uploads, and(
        eq(schema.documentChunks.uploadId, schema.uploads.id),
        eq(schema.documentChunks.ingestionId, schema.uploads.ingestionId)
      ))
      .where(and(
        eq(schema.uploads.isPublic, true),
        eq(schema.uploads.isActive, true),
        eq(schema.uploads.status, 'ready'),
        isNotNull(schema.uploads.ingestionId)
      ))
  ])

  return {
    index: {
      name: config.vectorizeIndexName,
      dimensions: description.dimensions,
      metric: config.vectorizeMetric,
      vectorCount: publishedRows[0]?.value || 0,
      processedUpToDatetime: description.processedUpToDatetime || null,
      processedUpToMutation: description.processedUpToMutation || null,
      embeddingModel: config.embeddingModel
    }
  }
})
