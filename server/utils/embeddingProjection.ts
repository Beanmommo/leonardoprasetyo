export interface EmbeddingProjectionPoint {
  x: number
  y: number
}

const EPSILON = 1e-12
const POWER_ITERATIONS = 80

function dot(left: number[], right: number[]): number {
  let total = 0
  for (let index = 0; index < left.length; index++) {
    total += left[index]! * right[index]!
  }
  return total
}

function normalize(values: number[]): number[] | null {
  const magnitude = Math.sqrt(dot(values, values))
  if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return null
  return values.map(value => value / magnitude)
}

function multiply(matrix: number[][], vector: number[]): number[] {
  return matrix.map(row => dot(row, vector))
}

function orthogonalize(vector: number[], bases: number[][]): number[] {
  const next = [...vector]
  for (const basis of bases) {
    const projection = dot(next, basis)
    for (let index = 0; index < next.length; index++) {
      next[index] = next[index]! - projection * basis[index]!
    }
  }
  return next
}

function dominantEigenvector(matrix: number[][], bases: number[][], seedOffset: number): { value: number, vector: number[] } | null {
  const size = matrix.length
  let vector = Array.from({ length: size }, (_, index) => Math.sin((index + 1) * (seedOffset + 1.618)))
  vector = orthogonalize(vector, bases)

  let magnitude = Math.sqrt(dot(vector, vector))
  if (magnitude <= EPSILON) return null
  vector = vector.map(value => value / magnitude)

  for (let iteration = 0; iteration < POWER_ITERATIONS; iteration++) {
    let next = orthogonalize(multiply(matrix, vector), bases)
    magnitude = Math.sqrt(dot(next, next))
    if (!Number.isFinite(magnitude) || magnitude <= EPSILON) return null
    next = next.map(value => value / magnitude)

    const alignment = Math.abs(dot(vector, next))
    vector = next
    if (1 - alignment <= 1e-10) break
  }

  const value = dot(vector, multiply(matrix, vector))
  if (!Number.isFinite(value) || value <= EPSILON) return null

  const anchor = vector.reduce((bestIndex, current, index) => (
    Math.abs(current) > Math.abs(vector[bestIndex]!) ? index : bestIndex
  ), 0)
  if (vector[anchor]! < 0) vector = vector.map(component => -component)

  return { value, vector }
}

/**
 * Projects L2-normalized embeddings into two dimensions with PCA. Working in
 * sample space keeps the calculation small for Library pages, while L2
 * normalization aligns the input geometry with the Vectorize cosine metric.
 */
export function projectEmbeddings2D(embeddings: readonly (readonly number[])[]): Array<EmbeddingProjectionPoint | null> {
  const validIndices = embeddings
    .map((embedding, index) => ({ embedding, index }))
    .filter(({ embedding }) => embedding.length > 0 && embedding.every(Number.isFinite))

  const output: Array<EmbeddingProjectionPoint | null> = embeddings.map(() => null)
  if (!validIndices.length) return output

  const dimensions = Math.min(...validIndices.map(({ embedding }) => embedding.length))
  const normalized = validIndices.flatMap(({ embedding, index }) => {
    const vector = normalize(Array.from(embedding.slice(0, dimensions)))
    return vector ? [{ index, vector }] : []
  })
  if (!normalized.length) return output

  const means = Array.from({ length: dimensions }, (_, dimension) => (
    normalized.reduce((total, item) => total + item.vector[dimension]!, 0) / normalized.length
  ))
  const centered = normalized.map(({ vector }) => (
    vector.map((value, dimension) => value - means[dimension]!)
  ))
  const gram = centered.map(left => centered.map(right => dot(left, right)))
  const first = dominantEigenvector(gram, [], 0)
  const second = first ? dominantEigenvector(gram, [first.vector], 1) : null

  normalized.forEach(({ index }, localIndex) => {
    output[index] = {
      x: first ? first.vector[localIndex]! * Math.sqrt(first.value) : 0,
      y: second ? second.vector[localIndex]! * Math.sqrt(second.value) : 0
    }
  })

  return output
}
