import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Indexing task ID is required' })
  }

  const [row] = await db.select({
    task: schema.indexingTasks,
    originalName: schema.uploads.originalName
  }).from(schema.indexingTasks)
    .innerJoin(schema.uploads, and(
      eq(schema.indexingTasks.uploadId, schema.uploads.id),
      eq(schema.indexingTasks.id, taskId)
    ))
    .limit(1)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Indexing task not found' })
  }

  return {
    task: serializeIndexingTask(row.task, row.originalName)
  }
})
