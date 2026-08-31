import { z } from 'zod'

const requestSchema = z.object({
  message: z.string().trim().min(1).max(1000)
}).strict()

export default defineEventHandler(async (event) => {
  const context = event.context as { indexingWorkflow?: boolean }
  if (context.indexingWorkflow !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const taskId = getRouterParam(event, 'id')
  const validation = requestSchema.safeParse(await readBody(event))
  if (!taskId || !validation.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid indexing workflow failure payload' })
  }

  await failIndexingTask(taskId, validation.data.message)
  return { taskId, recorded: true }
})
