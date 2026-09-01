import { db, schema } from 'hub:db'
import { and, eq, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Indexing task ID is required' })
  }

  const [row] = await db.select({
    task: schema.indexingTasks,
    originalName: schema.uploads.originalName,
    uploadStatus: schema.uploads.status
  }).from(schema.indexingTasks)
    .innerJoin(schema.uploads, and(
      eq(schema.indexingTasks.uploadId, schema.uploads.id),
      eq(schema.indexingTasks.id, taskId)
    ))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Indexing task not found' })
  }
  if (row.task.status !== 'failed') {
    throw createError({ statusCode: 409, statusMessage: 'Only failed indexing tasks can be retried' })
  }
  if (row.uploadStatus === 'deleted') {
    throw createError({ statusCode: 409, statusMessage: 'The Library upload has been deleted' })
  }

  const [activeTask] = await db.select({
    id: schema.indexingTasks.id
  }).from(schema.indexingTasks).where(and(
    eq(schema.indexingTasks.uploadId, row.task.uploadId),
    inArray(schema.indexingTasks.status, ['queued', 'processing'])
  )).limit(1)
  if (activeTask) {
    throw createError({ statusCode: 409, statusMessage: 'This document already has an active indexing task' })
  }

  try {
    const retryTask = await queueIndexingTask(event, row.task.uploadId)
    setResponseStatus(event, 202)
    return {
      originalTaskId: taskId,
      task: serializeIndexingTask(retryTask, row.originalName)
    }
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Failed Library indexing task could not be retried',
      taskId,
      uploadId: row.task.uploadId,
      error: error instanceof Error ? error.message : String(error)
    }))
    throw createError({ statusCode: 500, statusMessage: 'Indexing task could not be retried' })
  }
})
