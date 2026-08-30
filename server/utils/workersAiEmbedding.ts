import type { H3Event } from 'h3'
import {
  CLOUDFLARE_EMBEDDING_MODEL,
  getCloudflareConfig,
  requireCloudflareBinding
} from './cloudflareBindings'

type WorkersAiEmbeddingOptions = {
  kind: 'query' | 'document'
  title?: string
  signal?: AbortSignal
}

const RETRIEVAL_INSTRUCTION = 'Given a question, retrieve relevant passages from the indexed document library that answer the question.'

function readEmbeddingValues(payload: { data?: number[][] }): number[] | undefined {
  const values = payload.data?.[0]
  if (!Array.isArray(values) || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    return undefined
  }
  return values
}

export async function createWorkersAiEmbedding(
  event: H3Event,
  text: string,
  options: WorkersAiEmbeddingOptions
): Promise<number[]> {
  const normalizedText = text.trim()
  if (!normalizedText) {
    throw new Error('Cannot embed empty text')
  }

  const ai = requireCloudflareBinding(event, 'AI')
  const config = getCloudflareConfig(event)
  const input = options.kind === 'query'
    ? {
        queries: [normalizedText],
        instruction: RETRIEVAL_INSTRUCTION
      }
    : {
        documents: [normalizedText]
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

  const values = readEmbeddingValues(payload)
  if (!values || values.length !== config.embeddingDimensions) {
    throw new Error(`Workers AI returned an invalid embedding; expected ${config.embeddingDimensions} values`)
  }
  return values
}
