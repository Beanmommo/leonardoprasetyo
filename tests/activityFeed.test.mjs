import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { createClient } from '@libsql/client'
import { asc, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../server/db/schema.ts'
import { normalizeActivityDates } from '../server/utils/activityDateMigration.ts'
import { changedActivityDateOrder, firstActivityOrder, moveActivityWithinDay } from '../server/utils/activityOrdering.ts'
import { activityPageQuerySchema, afterActivityCursor, decodeActivityCursor, encodeActivityCursor } from '../server/utils/activityPagination.ts'
import { formatActivityDate } from '../shared/utils/activityDate.ts'

const activities = schema.leonardoActivities

async function fixture(t) {
  const client = createClient({ url: 'file::memory:' })
  t.after(() => client.close())
  const migrations = new URL('../server/db/migrations/sqlite/', import.meta.url)
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    await client.executeMultiple(readFileSync(new URL(name, migrations), 'utf8'))
  }
  const database = drizzle(client, { schema })
  const list = () => database.select().from(activities)
    .orderBy(desc(activities.date), asc(activities.order), asc(activities.id))
  const insert = async (day, title = day, order = firstActivityOrder(day)) => {
    const [entry] = await database.insert(activities).values({
      date: new Date(`${day}T00:00:00Z`), title, description: '', order
    }).returning()
    return entry
  }
  const revision = async () => (await database.select().from(schema.activityFeedState))[0].revision
  const page = (limit, cursor) => database.select().from(activities)
    .where(cursor ? afterActivityCursor(cursor) : undefined)
    .orderBy(desc(activities.date), asc(activities.order), asc(activities.id)).limit(limit)
  const cursorFor = async entry => decodeActivityCursor(encodeActivityCursor({
    date: formatActivityDate(entry.date), order: entry.order, id: entry.id, revision: await revision()
  }))
  return { database, client, insert, list, revision, page, cursorFor }
}

test('all migrations apply; concurrent prepends and deletion never renumber existing entries', async (t) => {
  const { database, insert, list, revision } = await fixture(t)
  const older = await insert('2026-09-06')
  const first = await insert('2026-09-07', 'Original')
  const before = new Map((await list()).map(entry => [entry.id, entry.order]))
  const added = await Promise.all(Array.from({ length: 20 }, (_, index) => insert('2026-09-07', `New ${index}`)))
  const rows = await list()
  assert.equal(new Set(rows.filter(entry => entry.date.getUTCDate() === 7).map(entry => entry.order)).size, 21)
  for (const entry of rows.filter(entry => before.has(entry.id))) assert.equal(entry.order, before.get(entry.id))
  assert.equal(rows.at(-1).id, older.id)
  assert.ok(added.every(entry => entry.order < first.order))
  const remaining = rows.filter(entry => entry.id !== first.id)
  await database.delete(activities).where(eq(activities.id, first.id))
  assert.deepEqual(await list(), remaining)
  assert.equal(await revision(), 0)
})

test('milestones share cursor ordering with activities and content edits preserve their position', async (t) => {
  const { database, insert, list, page, cursorFor, revision } = await fixture(t)
  const legacy = await insert('2026-09-07', 'Existing activity')
  assert.equal(legacy.type, 'activity')
  assert.equal(legacy.contentMarkdown, null)
  const [milestone] = await database.insert(activities).values({
    date: legacy.date,
    order: firstActivityOrder('2026-09-07'),
    type: 'milestone',
    title: 'A milestone',
    description: 'Short summary',
    contentMarkdown: '## A longer story\n\n![Picture](https://example.com/picture.jpg)'
  }).returning()
  assert.deepEqual((await list()).map(entry => entry.id), [milestone.id, legacy.id])
  const cursor = await cursorFor(milestone)
  assert.deepEqual((await page(20, cursor)).map(entry => entry.id), [legacy.id])
  await database.update(activities).set({
    contentMarkdown: '# Updated story', type: 'activity'
  }).where(eq(activities.id, milestone.id))
  const changed = (await list())[0]
  assert.equal(changed.order, milestone.order)
  assert.equal(changed.contentMarkdown, '# Updated story')
  assert.equal(await revision(), 0)
  await database.all(moveActivityWithinDay(milestone.id, 'down'))
  assert.deepEqual((await list()).map(entry => entry.id), [legacy.id, milestone.id])
})

test('arrows swap exactly two entries in the same day and stop at day boundaries', async (t) => {
  const { database, insert, list, revision } = await fixture(t)
  const older = await insert('2026-09-06')
  const last = await insert('2026-09-07', 'Last')
  const first = await insert('2026-09-07', 'First')
  assert.equal((await database.all(moveActivityWithinDay(first.id, 'up'))).length, 0)
  assert.equal((await database.all(moveActivityWithinDay(last.id, 'down'))).length, 0)
  assert.equal((await database.all(moveActivityWithinDay(older.id, 'up'))).length, 0)
  assert.equal(await revision(), 0)
  const changed = await database.all(moveActivityWithinDay(first.id, 'down'))
  assert.deepEqual(new Set(changed.map(entry => entry.id)), new Set([first.id, last.id]))
  const rows = await list()
  assert.deepEqual(rows.map(entry => entry.id), [last.id, first.id, older.id])
  assert.equal(rows.at(-1).order, older.order)
  assert.equal(await revision(), 2)
  assert.equal((await database.all(moveActivityWithinDay(crypto.randomUUID(), 'up'))).length, 0)
})

test('content edits preserve position; a date edit prepends only in the destination day', async (t) => {
  const { database, insert, list, revision } = await fixture(t)
  const moving = await insert('2026-09-06')
  const destination = await insert('2026-09-07')
  await database.update(activities).set({
    title: 'Edited', date: moving.date, order: changedActivityDateOrder('2026-09-06')
  }).where(eq(activities.id, moving.id))
  assert.equal(await revision(), 0)
  await database.update(activities).set({
    date: destination.date, order: changedActivityDateOrder('2026-09-07')
  }).where(eq(activities.id, moving.id))
  const rows = await list()
  assert.deepEqual(rows.map(entry => entry.id), [moving.id, destination.id])
  assert.equal(rows[0].order, destination.order - 1)
  assert.equal(rows[1].order, destination.order)
  assert.equal(await revision(), 1)
})

test('cursor pages traverse more than 100 entries, same-day boundaries and tied ranks without gaps', async (t) => {
  const { database, page, list, cursorFor, client } = await fixture(t)
  await database.insert(activities).values(Array.from({ length: 137 }, (_, index) => ({
    date: new Date(`2026-09-${String(7 - Math.floor(index / 45)).padStart(2, '0')}T00:00:00Z`),
    title: `Entry ${index}`, description: '', order: Math.floor(index / 2) - 100
  })))
  const expected = (await list()).map(entry => entry.id)
  const found = []
  let cursor
  while (true) {
    const rows = await page(20, cursor)
    if (!rows.length) break
    found.push(...rows.map(entry => entry.id))
    cursor = await cursorFor(rows.at(-1))
  }
  assert.deepEqual(found, expected)
  assert.equal(new Set(found).size, 137)
  const query = database.select().from(activities).where(afterActivityCursor(cursor))
    .orderBy(desc(activities.date), asc(activities.order), asc(activities.id)).limit(21).toSQL()
  const plan = await client.execute({ sql: `EXPLAIN QUERY PLAN ${query.sql}`, args: query.params })
  assert.ok(plan.rows.some(row => String(row.detail).includes('SEARCH leonardo_activities USING INDEX leonardo_activities_day_order_idx')))
  assert.ok(plan.rows.every(row => !String(row.detail).includes('TEMP B-TREE')))
})

test('deleting the cursor item and inserting ahead of it preserves the remaining page', async (t) => {
  const { database, insert, page, list, cursorFor, revision } = await fixture(t)
  for (let index = 0; index < 8; index++) await insert('2026-09-07', `${index}`)
  const expected = await list()
  const initial = await page(3)
  const cursor = await cursorFor(initial.at(-1))
  await insert('2026-09-07', 'New first item')
  await database.delete(activities).where(eq(activities.id, initial.at(-1).id))
  assert.deepEqual((await page(20, cursor)).map(entry => entry.id), expected.slice(3).map(entry => entry.id))
  assert.equal(cursor.revision, await revision())
  await database.all(moveActivityWithinDay(expected[4].id, 'up'))
  assert.notEqual(cursor.revision, await revision())
})

test('legacy backfill preserves Melbourne days, ranks and audit timestamps across DST and batches', async (t) => {
  const { database, list } = await fixture(t)
  const timestamps = [
    '2000-08-26T15:59:59Z', '2000-08-26T16:00:00Z',
    '2026-04-04T12:59:59Z', '2026-04-04T13:00:00Z',
    '2026-10-03T13:59:59Z', '2026-10-03T14:00:00Z',
    '2026-10-04T12:59:59Z', '2026-10-04T13:00:00Z',
    '2026-09-07T00:00:00Z'
  ]
  await database.insert(activities).values(Array.from({ length: 115 }, (_, index) => ({
    date: new Date(timestamps[index % timestamps.length]), title: `Legacy ${index}`, description: '', order: index
  })))
  const previous = new Map((await list()).map(entry => [entry.id, entry]))
  await normalizeActivityDates(database)
  for (const entry of await list()) {
    const old = previous.get(entry.id)
    assert.equal(entry.date.toISOString(), `${formatActivityDate(old.date)}T00:00:00.000Z`)
    assert.equal(entry.order, old.order)
    assert.deepEqual(entry.createdAt, old.createdAt)
    assert.deepEqual(entry.updatedAt, old.updatedAt)
  }
  const state = await database.select().from(schema.activityFeedState)
  assert.equal(state[0].datesNormalized, true)
  const normalized = await list()
  await normalizeActivityDates(database)
  assert.deepEqual(await list(), normalized)
  assert.deepEqual(await database.select().from(schema.activityFeedState), state)
})

test('cursor and page validation rejects invalid dates, ranks, versions and unbounded limits', () => {
  const cursor = { date: '2026-09-07', order: -12, id: crypto.randomUUID(), revision: 3 }
  assert.deepEqual(decodeActivityCursor(encodeActivityCursor(cursor)), { ...cursor, v: 1 })
  for (const change of [{ date: '2026-02-30' }, { order: 0.5 }, { order: Number.MAX_SAFE_INTEGER + 1 }, { revision: -1 }, { id: 'invalid' }]) {
    assert.throws(() => encodeActivityCursor({ ...cursor, ...change }))
  }
  assert.throws(() => decodeActivityCursor('garbage'))
  assert.throws(() => decodeActivityCursor(btoa(JSON.stringify({ ...cursor, v: 2 }))))
  assert.equal(activityPageQuerySchema.parse({}).limit, 20)
  for (const limit of ['0', '-1', '51', '1.5', 'NaN', ['20', '30']]) {
    assert.equal(activityPageQuerySchema.safeParse({ limit }).success, false)
  }
  for (const cursor of ['', 'a'.repeat(513), 'abc=']) {
    assert.equal(activityPageQuerySchema.safeParse({ cursor }).success, false)
  }
})
