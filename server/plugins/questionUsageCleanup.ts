import { db, schema } from 'hub:db'
import { lt } from 'drizzle-orm'

const QUESTION_USAGE_CRON = '17 0 * * *'
const RETENTION_DAYS = 7

function cutoffDateUtc(now = new Date()): string {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async ({ controller }) => {
    if (controller.cron !== QUESTION_USAGE_CRON) {
      return
    }

    const cutoff = cutoffDateUtc()
    const result = await db.delete(schema.questionUsage)
      .where(lt(schema.questionUsage.usageDateUtc, cutoff))

    console.log(JSON.stringify({
      message: 'Expired question usage rows cleaned up',
      cutoffDateUtc: cutoff,
      rowsDeleted: result.meta.changes
    }))
  })
})
