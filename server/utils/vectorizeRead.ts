// getByIds has a smaller payload limit than upsert/deleteByIds. Keep reads
// bounded even when a document contains hundreds of chunks.
const VECTOR_READ_BATCH_SIZE = 20

export async function getVectorsByIds(vectorize: Pick<Vectorize, 'getByIds'>, ids: string[]): Promise<VectorizeVector[]> {
  const vectors: VectorizeVector[] = []
  for (let offset = 0; offset < ids.length; offset += VECTOR_READ_BATCH_SIZE) {
    vectors.push(...await vectorize.getByIds(ids.slice(offset, offset + VECTOR_READ_BATCH_SIZE)))
  }
  return vectors
}
