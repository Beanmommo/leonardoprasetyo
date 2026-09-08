import { sql } from 'drizzle-orm'

/** Evaluated inside the INSERT/UPDATE, so concurrent writers cannot reuse a rank. */
export function firstActivityOrder(date: string) {
  return sql`(SELECT COALESCE(MIN("order"), 1) - 1
    FROM "leonardo_activities" WHERE "date" = ${Date.parse(`${date}T00:00:00Z`) / 1000})`
}

export function changedActivityDateOrder(date: string) {
  return sql`CASE WHEN "date" = ${Date.parse(`${date}T00:00:00Z`) / 1000}
    THEN "order" ELSE ${firstActivityOrder(date)} END`
}

export function moveActivityWithinDay(id: string, direction: 'up' | 'down') {
  const comparison = direction === 'up' ? sql`<` : sql`>`
  const neighborOrder = direction === 'up' ? sql`DESC` : sql`ASC`

  // Materialize both positions before either changes. Only same-day neighbors
  // participate; day boundaries and missing entries produce no updated rows.
  return sql`
    WITH moving AS MATERIALIZED (
      SELECT "id", "date", "order" FROM "leonardo_activities" WHERE "id" = ${id}
    ), neighbor AS MATERIALIZED (
      SELECT "id", "order" FROM "leonardo_activities"
      WHERE "date" = (SELECT "date" FROM moving)
        AND "order" ${comparison} (SELECT "order" FROM moving)
      ORDER BY "order" ${neighborOrder}, "id" ${neighborOrder}
      LIMIT 1
    )
    UPDATE "leonardo_activities"
    SET "order" = CASE
      WHEN "id" = ${id} THEN (SELECT "order" FROM neighbor)
      ELSE (SELECT "order" FROM moving)
    END
    WHERE "id" IN (SELECT "id" FROM moving UNION ALL SELECT "id" FROM neighbor)
      AND EXISTS (SELECT 1 FROM neighbor)
    RETURNING "id"
  `
}
