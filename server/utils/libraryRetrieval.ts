import type { H3Event } from 'h3'
import { createWorkersAiEmbedding } from './workersAiEmbedding'
import { requireCloudflareBinding } from './cloudflareBindings'

const VECTOR_MATCH_LIMIT = 5
const VECTOR_CANDIDATE_LIMIT = 20
const MAX_CONTEXT_CHARS_PER_CHUNK = 3_500
const MAX_EXCERPT_CHARS = 280

interface LibraryChunkRow {
  vector_id: string
  upload_id: string
  original_name: string
  role: 'resume' | 'document'
  chunk_index: number
  page_number: number | null
  text_content: string
}

export interface LibraryCitation {
  id: string
  uploadId: string
  filename: string
  pageNumber: number
  url: string
  excerpt: string
  score: number
}

export interface LibraryRetrievalResult {
  uploadId: string | null
  context: string
  citations: LibraryCitation[]
}

function cleanPreview(text: string, maximumLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= maximumLength) return compact
  return `${compact.slice(0, maximumLength - 1).trimEnd()}…`
}

function safePageNumber(value: number | null): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : 1
}

/**
 * Embed the visitor's latest question, search all published Library sources,
 * and load authoritative current-generation chunk text from D1.
 */
export async function retrieveLibraryContext(
  event: H3Event,
  question: string,
  signal?: AbortSignal
): Promise<LibraryRetrievalResult> {
  const DB = requireCloudflareBinding(event, 'DB')
  const VECTORIZE = requireCloudflareBinding(event, 'VECTORIZE')

  const queryVector = await createWorkersAiEmbedding(event, question, {
    kind: 'query',
    signal
  })
  const vectorMatches = await VECTORIZE.query(queryVector, {
    topK: VECTOR_CANDIDATE_LIMIT,
    returnMetadata: 'none',
    returnValues: false
  })

  if (vectorMatches.matches.length === 0) {
    return { uploadId: null, context: '', citations: [] }
  }

  const matchIds = vectorMatches.matches.map(match => match.id)
  const placeholders = matchIds.map(() => '?').join(', ')
  const chunkResult = await DB.prepare(`
    SELECT
      dc.vector_id,
      dc.upload_id,
      dc.chunk_index,
      dc.page_number,
      dc.text_content,
      u.original_name,
      u.role
    FROM document_chunks AS dc
    INNER JOIN uploads AS u ON u.id = dc.upload_id
    WHERE dc.vector_id IN (${placeholders})
      AND dc.ingestion_id = u.ingestion_id
      AND u.is_public = 1
      AND u.is_active = 1
      AND u.status = 'ready'
      AND u.ingestion_id IS NOT NULL
  `).bind(...matchIds).all<LibraryChunkRow>()

  const chunksByVectorId = new Map(
    chunkResult.results.map(chunk => [chunk.vector_id, chunk] as const)
  )
  const ranked = vectorMatches.matches.flatMap((match) => {
    const chunk = chunksByVectorId.get(match.id)
    return chunk ? [{ chunk, score: Number(match.score) }] : []
  }).slice(0, VECTOR_MATCH_LIMIT)

  const citations = ranked.map(({ chunk, score }) => {
    const pageNumber = safePageNumber(chunk.page_number)
    return {
      id: chunk.vector_id,
      uploadId: chunk.upload_id,
      filename: chunk.original_name,
      pageNumber,
      url: chunk.role === 'resume'
        ? `/api/library/resume/content#page=${pageNumber}`
        : `/api/library/files/${encodeURIComponent(chunk.upload_id)}/content#page=${pageNumber}`,
      excerpt: cleanPreview(chunk.text_content, MAX_EXCERPT_CHARS),
      score: Number.isFinite(score) ? score : 0
    }
  })

  const context = ranked.map(({ chunk }, index) => {
    const pageNumber = safePageNumber(chunk.page_number)
    const text = chunk.text_content.trim().slice(0, MAX_CONTEXT_CHARS_PER_CHUNK)
    return [
      `[Source ${index + 1}]`,
      `File: ${chunk.original_name}`,
      `Role: ${chunk.role}`,
      `Page: ${pageNumber}`,
      `Text: ${text}`
    ].join('\n')
  }).join('\n\n')

  return {
    uploadId: citations[0]?.uploadId || null,
    context,
    citations
  }
}
