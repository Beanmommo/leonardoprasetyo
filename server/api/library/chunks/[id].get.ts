import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const chunkParamsSchema = z.object({
  id: z.string().trim().min(1).max(256)
})

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, chunkParamsSchema.parse)
  const chunk = await db.query.documentChunks.findFirst({
    where: () => eq(schema.documentChunks.vectorId, id)
  })

  if (!chunk) {
    throw createError({ statusCode: 404, statusMessage: 'RAG chunk not found' })
  }

  const upload = await db.query.uploads.findFirst({
    where: () => and(
      eq(schema.uploads.id, chunk.uploadId),
      eq(schema.uploads.ingestionId, chunk.ingestionId),
      eq(schema.uploads.isPublic, true),
      eq(schema.uploads.isActive, true),
      eq(schema.uploads.status, 'ready')
    )
  })

  if (!upload) {
    throw createError({ statusCode: 404, statusMessage: 'RAG chunk not found' })
  }

  return {
    chunk: {
      id: chunk.vectorId,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      textContent: chunk.textContent,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      tokenCount: chunk.tokenCount,
      contentHash: chunk.contentHash,
      embeddingModel: chunk.embeddingModel,
      dimensions: chunk.embeddingDimensions,
      indexedAt: chunk.indexedAt.toISOString(),
      sourceFile: {
        id: upload.id,
        name: upload.originalName,
        url: `/api/library/files/${upload.id}/content`
      }
    }
  }
})
