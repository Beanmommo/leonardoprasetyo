import { z } from 'zod'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'

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
    const upload = await db.query.uploads.findFirst({
      where: () => eq(schema.uploads.id, uploadId)
    })
    if (!upload || upload.status === 'deleted') {
      throw createError({ statusCode: 404, statusMessage: 'Library upload not found' })
    }

    const taskId = crypto.randomUUID()
    const now = new Date()
    const [task] = await db.insert(schema.indexingTasks).values({
      id: taskId,
      uploadId,
      workflowInstanceId: taskId,
      status: 'queued',
      stage: 'queued',
      progressCurrent: 0,
      attempt: 0,
      createdAt: now,
      updatedAt: now
    }).returning()
    if (!task) {
      throw new Error('D1 did not return the queued indexing task')
    }

    try {
      const workflow = requireCloudflareBinding(event, 'INDEXING_WORKFLOW')
      await workflow.create({
        id: taskId,
        params: { taskId, uploadId }
      })
    } catch (error) {
      await failIndexingTask(taskId, error)
      throw error
    }

    setResponseStatus(event, 202)
    return {
      task: serializeIndexingTask(task, upload.originalName)
    }
  } catch (error) {
    if (isClientError(error)) {
      throw error
    }
    console.error(JSON.stringify({
      message: 'Document ingestion could not be queued',
      uploadId,
      error: error instanceof Error ? error.message : String(error)
    }))
    throw createError({ statusCode: 500, statusMessage: 'Document ingestion could not be queued' })
  }
})
