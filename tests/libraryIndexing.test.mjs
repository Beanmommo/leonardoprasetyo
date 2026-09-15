import assert from 'node:assert/strict'
import test from 'node:test'
import { getVectorsByIds } from '../server/utils/vectorizeRead.ts'
import { createWorkersAiEmbedding, createWorkersAiEmbeddings } from '../server/utils/workersAiEmbedding.ts'

test('Vectorize reads handle 29 IDs from the failed run and the 250-chunk ceiling', async () => {
  for (const count of [0, 1, 20, 21, 29, 250]) {
    const ids = Array.from({ length: count }, (_, index) => `chunk-${index}`)
    const requests = []
    const result = await getVectorsByIds({
      async getByIds(batch) {
        assert.ok(batch.length > 0 && batch.length <= 20)
        requests.push(batch)
        return batch.map(id => ({ id, values: [1] }))
      }
    }, ids)
    assert.equal(requests.length, Math.ceil(count / 20))
    assert.deepEqual(result.map(vector => vector.id), ids)
  }
})

test('batched Vectorize reads preserve missing IDs and surface service errors', async () => {
  const vectors = await getVectorsByIds({ getByIds: async () => [] }, ['pending'])
  assert.deepEqual(vectors, [])
  await assert.rejects(getVectorsByIds({
    getByIds: async () => { throw new Error('Service unavailable') }
  }, ['pending']), /Service unavailable/)
})

test('document embeddings use one ordered batch and keep gateway privacy settings', async () => {
  const texts = Array.from({ length: 10 }, (_, index) => `  Passage ${index}  `)
  const expected = texts.map((_, index) => Array(1024).fill(index))
  const controller = new AbortController()
  let requests = 0
  const result = await createWorkersAiEmbeddings({
    AI: {
      async run(model, input, options) {
        requests++
        assert.equal(model, '@cf/qwen/qwen3-embedding-0.6b')
        assert.deepEqual(input, { documents: texts.map(text => text.trim()) })
        assert.equal(options.extraHeaders['cf-aig-collect-log-payload'], 'false')
        assert.equal(options.gateway.skipCache, true)
        assert.equal(options.signal, controller.signal)
        return { data: expected }
      }
    }
  }, texts, { kind: 'document', signal: controller.signal })
  assert.equal(requests, 1)
  assert.deepEqual(result, expected)
})

test('query embedding keeps the retrieval instruction and single-vector result', async () => {
  const expected = Array(1024).fill(0.5)
  const result = await createWorkersAiEmbedding({
    AI: {
      async run(_model, input) {
        assert.deepEqual(input.queries, ['Question'])
        assert.equal(typeof input.instruction, 'string')
        assert.equal(input.documents, undefined)
        return { data: [expected] }
      }
    }
  }, ' Question ', { kind: 'query' })
  assert.deepEqual(result, expected)
})

test('invalid batch results cannot misalign chunk and vector records', async () => {
  const valid = Array(1024).fill(1)
  for (const data of [undefined, [valid], [valid, valid, valid], [valid, [1]], [valid, Array(1024).fill(NaN)], [valid, Array(1024).fill(Infinity)]]) {
    await assert.rejects(createWorkersAiEmbeddings({
      AI: { run: async () => ({ data }) }
    }, ['First', 'Second'], { kind: 'document' }), /invalid embeddings/)
  }
})

test('empty batches and blank inputs never call Workers AI', async () => {
  const source = { AI: { run: async () => assert.fail('Unexpected AI call') } }
  assert.deepEqual(await createWorkersAiEmbeddings(source, [], { kind: 'document' }), [])
  await assert.rejects(createWorkersAiEmbeddings(source, ['Text', '  '], { kind: 'document' }), /empty text/)
})
