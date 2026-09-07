import { db, schema } from 'hub:db'
import { asc, sql } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const { direction } = await readValidatedBody(event, z.object({ direction: z.enum(['up', 'down']) }).parse)

  const comparison = direction === 'up' ? sql`<` : sql`>`
  const neighborOrder = direction === 'up' ? sql`DESC` : sql`ASC`

  // Materialize both positions before updating either row. A single statement
  // keeps swaps atomic even when another request inserts, moves, or deletes.
  await db.run(sql`
    WITH moving AS MATERIALIZED (
      SELECT "id", "order" FROM "leonardo_activities" WHERE "id" = ${id}
    ), neighbor AS MATERIALIZED (
      SELECT "id", "order" FROM "leonardo_activities"
      WHERE "order" ${comparison} (SELECT "order" FROM moving)
      ORDER BY "order" ${neighborOrder}
      LIMIT 1
    )
    UPDATE "leonardo_activities"
    SET "order" = CASE
      WHEN "id" = ${id} THEN (SELECT "order" FROM neighbor)
      ELSE (SELECT "order" FROM moving)
    END
    WHERE "id" IN (SELECT "id" FROM moving UNION ALL SELECT "id" FROM neighbor)
      AND EXISTS (SELECT 1 FROM neighbor)
  `)

  const activities = await db.select()
    .from(schema.leonardoActivities)
    .orderBy(asc(schema.leonardoActivities.order))

  if (!activities.some(activity => activity.id === id)) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }

  return { activities: activities.map(serializeLeonardoActivity) }
})
