import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { H3Event } from 'h3'

const requestSchema = z.object({
  uploadId: z.string().uuid()
}).strict()

function assertIndexingWorkflow(event: H3Event): void {
  const context = event.context as { indexingWorkflow?: boolean }
  if (context.indexingWorkflow !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

export default defineEventHandler(async (event) => {
  assertIndexingWorkflow(event)
  const taskId = getRouterParam(event, 'id')
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Indexing task ID is required' })
  }

  const validation = requestSchema.safeParse(await readBody(event))
  if (!validation.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid indexing workflow payload' })
  }

  const task = await db.query.indexingTasks.findFirst({
    where: () => eq(schema.indexingTasks.id, taskId)
  })
  if (!task || task.uploadId !== validation.data.uploadId) {
    throw createError({ statusCode: 404, statusMessage: 'Indexing task not found' })
  }

  await startIndexingTask(taskId)
  try {
    const result = await ingestDocument(event, task.uploadId, {
      onProgress: progress => updateIndexingTaskProgress(taskId, progress)
    })
    await completeIndexingTask(taskId, result)
    return { taskId, result }
  } catch (error) {
    await failIndexingTask(taskId, error)
    console.error(JSON.stringify({
      message: 'Indexing workflow attempt failed',
      taskId,
      uploadId: task.uploadId,
      error: error instanceof Error ? error.message : String(error)
    }))
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : 'Document indexing failed'
    })
  }
})
