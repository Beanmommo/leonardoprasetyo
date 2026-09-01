import { db, schema } from 'hub:db'
import { and, asc, count, desc, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'

const vectorQuerySchema = z.object({
  uploadId: z.string().uuid().optional(),
  cursor: z.string().max(32).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10)
}).refine(query => !(query.cursor && query.page), {
  message: 'Use either cursor or page pagination, not both'
})

function encodeCursor(offset: number): string {
  return btoa(String(offset)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeCursor(value: string | undefined): number {
  if (!value) {
    return 0
  }
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
    const offset = Number.parseInt(atob(padded), 10)
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) {
      throw new Error('Invalid cursor')
    }
    return offset
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid vector cursor' })
  }
}

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, vectorQuerySchema.parse)
  const offset = query.page ? (query.page - 1) * query.limit : decodeCursor(query.cursor)
  const upload = await db.query.uploads.findFirst({
    where: () => and(
      ...(query.uploadId ? [eq(schema.uploads.id, query.uploadId)] : []),
      eq(schema.uploads.isPublic, true),
      eq(schema.uploads.isActive, true),
      eq(schema.uploads.status, 'ready'),
      isNotNull(schema.uploads.ingestionId)
    ),
    orderBy: () => desc(schema.uploads.indexedAt)
  })

  if (!upload?.ingestionId) {
    if (!query.uploadId) {
      return {
        uploadId: null,
        items: [],
        nextCursor: null,
        hasMore: false,
        page: query.page ?? 1,
        pageSize: query.limit,
        total: 0
      }
    }
    throw createError({ statusCode: 404, statusMessage: 'Active Library upload not found' })
  }

  const chunkFilter = and(
    eq(schema.documentChunks.uploadId, upload.id),
    eq(schema.documentChunks.ingestionId, upload.ingestionId)
  )
  const [rows, countRows] = await Promise.all([
    db.select({
      vectorId: schema.documentChunks.vectorId,
      pageNumber: schema.documentChunks.pageNumber,
      chunkIndex: schema.documentChunks.chunkIndex,
      textContent: schema.documentChunks.textContent,
      embeddingModel: schema.documentChunks.embeddingModel,
      embeddingDimensions: schema.documentChunks.embeddingDimensions,
      indexedAt: schema.documentChunks.indexedAt
    }).from(schema.documentChunks)
      .where(chunkFilter)
      .orderBy(asc(schema.documentChunks.chunkIndex))
      .limit(query.limit + 1)
      .offset(offset),
    db.select({ value: count() }).from(schema.documentChunks).where(chunkFilter)
  ])

  const hasMore = rows.length > query.limit
  const total = countRows[0]?.value ?? 0
  const page = rows.slice(0, query.limit)
  const vectorize = requireCloudflareBinding(event, 'VECTORIZE')
  const vectors = page.length > 0 ? await vectorize.getByIds(page.map(row => row.vectorId)) : []
  const vectorById = new Map(vectors.flatMap((vector) => {
    const metadata = vector.metadata as Record<string, unknown> | undefined
    return vector.namespace === upload.ingestionId
      && metadata?.upload_id === upload.id
      && metadata?.ingestion_id === upload.ingestionId
      ? [[vector.id, vector] as const]
      : []
  }))
  const vectorValues = page.map((row) => {
    const vector = vectorById.get(row.vectorId)
    return vector ? Array.from(vector.values) : []
  })
  const projections = projectEmbeddings2D(vectorValues)
  const items = page.map((row, index) => {
    const values = vectorValues[index]!
    const magnitude = values.length > 0
      ? Math.sqrt(values.reduce((total, value) => total + value * value, 0))
      : null
    return {
      vectorId: row.vectorId,
      sourceFilename: upload.originalName,
      sourceFileUrl: upload.role === 'resume'
        ? '/api/library/resume/content'
        : `/api/library/files/${upload.id}/content`,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      textPreview: row.textContent.slice(0, 320),
      embeddingModel: row.embeddingModel,
      dimensions: row.embeddingDimensions,
      magnitude,
      valuesPreview: values.slice(0, 10),
      projection: projections[index],
      indexedAt: row.indexedAt.toISOString()
    }
  })

  return {
    uploadId: upload.id,
    items,
    nextCursor: hasMore ? encodeCursor(offset + query.limit) : null,
    hasMore,
    page: query.page ?? Math.floor(offset / query.limit) + 1,
    pageSize: query.limit,
    total
  }
})
