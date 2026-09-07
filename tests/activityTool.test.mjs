import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { activitySearchSchema, repairActivityToolInput, searchLeonardoActivities } from '../server/utils/leonardoActivitySearch.ts'
import { createLeonardoActivityTool } from '../server/ai/tools/leonardoActivity.ts'

function fixture(entries) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE leonardo_activities (id TEXT PRIMARY KEY, date INTEGER, title TEXT, description TEXT, "order" INTEGER, image_key TEXT)')
  for (const [id, date, title, description = '', order = 0] of entries) {
    sqlite.prepare('INSERT INTO leonardo_activities VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, Date.parse(`${date}T00:00:00Z`) / 1000, title, description, order, 'private/image-key')
  }
  return {
    sqlite,
    database: {
      prepare(query) {
        return { bind: (...values) => ({ all: async () => ({ results: sqlite.prepare(query).all(...values) }) }) }
      }
    }
  }
}

test('recent results use activity dates, are bounded, and expose only public fields', async (t) => {
  const { sqlite, database } = fixture([
    ['old', '2025-01-01', 'Old milestone', '', -100],
    ['new', '2026-09-07', 'Newest project', 'Details', 100],
    ['middle', '2026-09-06', 'Previous update']
  ])
  t.after(() => sqlite.close())
  const result = await searchLeonardoActivities(database, { limit: 2 })
  assert.deepEqual(result.activities.map(item => item.id), ['new', 'middle'])
  assert.equal(result.hasMore, true)
  assert.equal(result.activities[0].date, '2026-09-07')
  assert.equal(result.activities[0].url, '/leonardo-activity#activity-new')
  assert.equal(JSON.stringify(result).includes('private/image-key'), false)
})

test('date range endpoints are inclusive, with literal case-insensitive text search', async (t) => {
  const { sqlite, database } = fixture([
    ['first', '2026-09-01', 'LangChain prototype'],
    ['last', '2026-09-07', 'Released', 'Uses LANGCHAIN'],
    ['outside', '2026-09-08', 'LangChain future']
  ])
  t.after(() => sqlite.close())
  const result = await searchLeonardoActivities(database, { query: 'langchain', fromDate: '2026-09-01', toDate: '2026-09-07' })
  assert.deepEqual(result.activities.map(item => item.id), ['last', 'first'])
  assert.equal(result.hasMore, false)
  for (const query of ['\' OR 1=1 --', '%', '_', 'no match']) {
    assert.equal((await searchLeonardoActivities(database, { query })).activities.length, 0)
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS total FROM leonardo_activities').get().total, 3)
})

test('tool schema rejects unsafe limits, invalid dates, and database selectors', () => {
  for (const input of [{ limit: 0 }, { limit: 11 }, { limit: 1.5 }, { fromDate: '2026-02-30' }, { fromDate: '2026-09-07', toDate: '2026-09-01' }, { database: 'production' }, { sql: 'DELETE FROM leonardo_activities' }]) {
    assert.equal(activitySearchSchema.safeParse(input).success, false)
  }
})

test('legacy timestamp filters follow Melbourne dates across daylight saving changes', async (t) => {
  const { sqlite, database } = fixture([])
  t.after(() => sqlite.close())
  for (const [id, timestamp] of [
    ['before', '2026-10-03T13:59:59Z'],
    ['midnight', '2026-10-03T14:00:00Z'],
    ['late', '2026-10-04T12:59:59Z'],
    ['after', '2026-10-04T13:00:00Z']
  ]) {
    sqlite.prepare('INSERT INTO leonardo_activities VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, Date.parse(timestamp) / 1000, id, '', 0, null)
  }
  const result = await searchLeonardoActivities(database, { fromDate: '2026-10-04', toDate: '2026-10-04' })
  assert.deepEqual(result.activities.map(item => item.id), ['late', 'midnight'])
  assert.ok(result.activities.every(item => item.date === '2026-10-04'))
})

test('double-encoded model arguments are repaired only when the decoded schema is valid', () => {
  assert.equal(repairActivityToolInput(JSON.stringify(JSON.stringify({ limit: 3 }))), '{"limit":3}')
  for (const input of ['invalid', '{"limit":3}', JSON.stringify('{"limit":100}'), JSON.stringify('{"sql":"DELETE FROM leonardo_activities"}')]) {
    assert.equal(repairActivityToolInput(input), null)
  }
})

test('LangChain tool uses only its injected environment and keeps citation labels stable', async (t) => {
  const dev = fixture([['dev', '2026-09-07', 'Development update']])
  const prod = fixture([['prod', '2026-09-07', 'Production update']])
  t.after(() => {
    dev.sqlite.close()
    prod.sqlite.close()
  })
  for (const [expected, environment] of [['dev', dev], ['prod', prod]]) {
    let citations = []
    const tool = createLeonardoActivityTool({
      database: environment.database,
      signal: new AbortController().signal,
      tracingEnabled: false,
      onCitations: (value) => { citations = value }
    })
    for (let index = 0; index < 2; index++) {
      const result = await tool.execute({ limit: 5 }, { toolCallId: `test-${index}`, messages: [] })
      assert.equal(result.activities[0].id, expected)
      assert.equal(result.activities[0].citation, '[Activity 1]')
      assert.equal(citations.length, 1)
      assert.equal(citations[0].id, `activity:${expected}`)
    }
    await assert.rejects(() => tool.execute({ limit: 5 }, { toolCallId: 'over-limit', messages: [] }), /lookup limit/)
  }
})

test('an aborted tool call never queries D1', async () => {
  const controller = new AbortController()
  controller.abort()
  const tool = createLeonardoActivityTool({
    database: { prepare() { assert.fail('Aborted call queried D1') } },
    signal: controller.signal,
    tracingEnabled: false,
    onCitations() { assert.fail('Aborted call emitted citations') }
  })
  await assert.rejects(() => tool.execute({ limit: 5 }, { toolCallId: 'aborted', messages: [] }))
})
