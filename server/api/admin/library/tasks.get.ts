import { db, schema } from 'hub:db'
import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const rows = await db.select({
    task: schema.indexingTasks,
    originalName: schema.uploads.originalName
  }).from(schema.indexingTasks)
    .innerJoin(schema.uploads, eq(schema.indexingTasks.uploadId, schema.uploads.id))
    .orderBy(desc(schema.indexingTasks.createdAt))
    .limit(100)

  return {
    tasks: rows.map(row => serializeIndexingTask(row.task, row.originalName))
  }
})
