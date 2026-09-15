import {
  CLOUDFLARE_EMBEDDING_MODEL,
  getCloudflareConfig,
  requireCloudflareBinding
} from './cloudflareBindings.ts'
import type { CloudflareBindingSource } from './cloudflareBindings.ts'

type WorkersAiEmbeddingOptions = {
  kind: 'query' | 'document'
  title?: string
  signal?: AbortSignal
}

const RETRIEVAL_INSTRUCTION = 'Given a question, retrieve relevant passages from the indexed document library that answer the question.'

export async function createWorkersAiEmbedding(
  source: CloudflareBindingSource,
  text: string,
  options: WorkersAiEmbeddingOptions
): Promise<number[]> {
  const embeddings = await createWorkersAiEmbeddings(source, [text], options)
  return embeddings[0]!
}

export async function createWorkersAiEmbeddings(
  source: CloudflareBindingSource,
  texts: string[],
  options: WorkersAiEmbeddingOptions
): Promise<number[][]> {
  if (texts.length === 0) return []
  const normalizedTexts = texts.map(text => text.trim())
  if (normalizedTexts.some(text => !text)) {
    throw new Error('Cannot embed empty text')
  }

  const ai = requireCloudflareBinding(source, 'AI')
  const config = getCloudflareConfig(source)
  const input = options.kind === 'query'
    ? {
        queries: normalizedTexts,
        instruction: RETRIEVAL_INSTRUCTION
      }
    : {
        documents: normalizedTexts
      }

  const payload = await ai.run(CLOUDFLARE_EMBEDDING_MODEL, input, {
    gateway: {
      id: config.aiGatewayId,
      skipCache: true,
      collectLog: true,
      metadata: {
        route: options.kind === 'query' ? 'library-query-embedding' : 'library-document-embedding',
        ...(options.title ? { document: options.title.slice(0, 100) } : {})
      }
    },
    extraHeaders: {
      'cf-aig-collect-log-payload': 'false'
    },
    signal: options.signal
  })

  const embeddings = payload.data
  if (!Array.isArray(embeddings)
    || embeddings.length !== texts.length
    || embeddings.some(values => !Array.isArray(values)
      || values.length !== config.embeddingDimensions
      || values.some(value => typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new Error(`Workers AI returned invalid embeddings; expected ${texts.length} vectors with ${config.embeddingDimensions} values each`)
  }
  return embeddings
}
