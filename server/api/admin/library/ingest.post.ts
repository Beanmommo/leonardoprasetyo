import { z } from 'zod'

const ingestRequestSchema = z.object({
  uploadId: z.string().uuid()
}).strict()

const MAX_INGEST_BODY_BYTES = 16 * 1024

function isClientError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
    && error.statusCode < 500
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const contentType = (getRequestHeader(event, 'content-type') || '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== 'application/json') {
    throw createError({ statusCode: 415, statusMessage: 'Document ingestion requires application/json' })
  }

  const contentLengthHeader = getRequestHeader(event, 'content-length')
  if (contentLengthHeader) {
    if (!/^\d+$/.test(contentLengthHeader) || Number(contentLengthHeader) > MAX_INGEST_BODY_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Document ingestion request is too large' })
    }
  }

  const rawBody = await readRawBody(event, 'utf8')
  if (rawBody && new TextEncoder().encode(rawBody).byteLength > MAX_INGEST_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Document ingestion request is too large' })
  }
  let body: unknown = {}
  if (rawBody?.trim()) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Malformed document ingestion JSON' })
    }
  }

  const validation = ingestRequestSchema.safeParse(body)
  if (!validation.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid document ingestion request' })
  }
  const { uploadId } = validation.data

  try {
    return await ingestDocument(event, uploadId)
  } catch (error) {
    if (isClientError(error)) {
      throw error
    }
    console.error(JSON.stringify({
      message: 'Document ingestion failed',
      uploadId,
      error: error instanceof Error ? error.message : String(error)
    }))
    throw createError({ statusCode: 500, statusMessage: 'Document ingestion failed' })
  }
})
