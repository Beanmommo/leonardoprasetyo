import { db, schema } from 'hub:db'
import { and, count, eq, exists, gt, lte, ne } from 'drizzle-orm'
import { createWorkersAiEmbedding } from './workersAiEmbedding'
import { getCloudflareConfig, requireCloudflareBinding } from './cloudflareBindings'
import type { CloudflareBindingSource } from './cloudflareBindings'
import type { IndexingTaskProgress } from './indexingTasks'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_PDF_PAGES = 200
const MAX_EXTRACTED_CHARACTERS = 500_000
const MAX_DOCUMENT_CHUNKS = 250
const VECTOR_BATCH_SIZE = 100
// D1 accepts at most 100 bound parameters per statement. Each staged chunk
// inserts 15 columns, so six rows (90 parameters) is the largest safe batch.
const DB_BATCH_SIZE = 6
const EMBEDDING_CONCURRENCY = 3
// Vectorize mutations are asynchronous. A busy remote development index can
// take longer than the typical few seconds to expose an accepted upsert, so do
// not roll back a valid generation after only 30 seconds.
const VECTOR_VISIBILITY_TIMEOUT_MS = 2 * 60 * 1000
const VECTOR_VISIBILITY_POLL_MS = 1_000
// Keep the persisted lease key compatible with the existing D1 constraint.
// The lease protects publication of any Library document, not only resumes.
const DOCUMENT_INGESTION_LEASE_NAME = 'resume-publication'
const DOCUMENT_INGESTION_LEASE_TTL_MS = 5 * 60 * 1000

type ExtractedPage = {
  pageNumber: number
  text: string
}

type PreparedChunk = {
  id: string
  vectorId: string
  chunkIndex: number
  pageNumber: number
  textContent: string
  charStart: number | null
  charEnd: number | null
  tokenCount: number
  contentHash: string
}

type DocumentIngestionLease = {
  ingestionId: string
  uploadId: string
}

class DocumentIngestionLeaseLostError extends Error {
  readonly statusCode = 409
  readonly statusMessage = 'Document ingestion lease lost; retry the request'

  constructor() {
    super('The document ingestion lease expired or was taken over')
    this.name = 'DocumentIngestionLeaseLostError'
  }
}

class DocumentIngestionLimitError extends Error {
  readonly statusCode = 422
  readonly statusMessage: string

  constructor(message: string) {
    super(message)
    this.name = 'DocumentIngestionLimitError'
    this.statusMessage = message
  }
}

export type DocumentIngestionResult = {
  uploadId: string
  status: 'ready'
  pageCount: number
  chunkCount: number
  embeddingModel: string
  embeddingDimensions: number
  extractionMethod: 'pdf-parse' | 'cloudflare-markdown' | 'existing'
  vectorMutationIds: string[]
  alreadyIndexed: boolean
}

export type DocumentIngestionOptions = {
  onProgress?: (progress: IndexingTaskProgress) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stripUnsafeControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13
    return (code < 32 && !isAllowedWhitespace) || code === 127 ? '' : character
  }).join('')
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const ownedBytes = Uint8Array.from(value)
  return toHex(await crypto.subtle.digest('SHA-256', ownedBytes.buffer))
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
}

async function extractWithPdfParse(blob: Blob): Promise<ExtractedPage[]> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    maxImageSize: 4_000_000,
    stopAtErrors: true,
    useSystemFonts: false,
    useWorkerFetch: false
  })
  try {
    const result = await parser.getText({ first: MAX_PDF_PAGES })
    if (result.total > MAX_PDF_PAGES) {
      throw new DocumentIngestionLimitError(`The PDF exceeds the ${MAX_PDF_PAGES}-page ingestion limit`)
    }
    return result.pages.map(page => ({
      pageNumber: page.num,
      text: page.text.trim()
    })).filter(page => page.text.length > 0)
  } finally {
    await parser.destroy()
  }
}

function splitMarkdownPages(markdown: string): ExtractedPage[] {
  const pageHeading = /(?:^|\n)#{1,6}[ \t]+page[ \t]+(\d+)[ \t]*(?:\r?\n|$)/gi
  const headings = Array.from(markdown.matchAll(pageHeading))
  if (headings.length > 0) {
    return headings.flatMap((heading, index) => {
      const pageNumber = Number.parseInt(heading[1]!, 10)
      const start = (heading.index || 0) + heading[0].length
      const end = headings[index + 1]?.index ?? markdown.length
      const text = markdown.slice(start, end).trim()
      return Number.isSafeInteger(pageNumber) && pageNumber > 0 && text
        ? [{ pageNumber, text }]
        : []
    })
  }

  const pageSeparator = /(?:\f|\n\s*<!--\s*(?:page|pagebreak)[^>]*-->\s*\n|\n\s*---\s*page\s+\d+\s*---\s*\n)/gi
  return markdown.split(pageSeparator)
    .map(text => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ pageNumber: index + 1, text }))
}

async function extractWithCloudflare(source: CloudflareBindingSource, name: string, blob: Blob): Promise<ExtractedPage[]> {
  const ai = requireCloudflareBinding(source, 'AI')
  const result = await ai.toMarkdown({ name, blob }, {
    conversionOptions: {
      output: { format: 'markdown' },
      pdf: { metadata: false }
    }
  })

  if (result.format === 'error') {
    throw new Error(`Cloudflare PDF conversion failed: ${result.error}`)
  }
  return splitMarkdownPages(result.data)
}

async function extractPdf(source: CloudflareBindingSource, name: string, blob: Blob): Promise<{
  pages: ExtractedPage[]
  method: DocumentIngestionResult['extractionMethod']
}> {
  try {
    const pages = await extractWithPdfParse(blob)
    if (pages.length > 0) {
      return { pages, method: 'pdf-parse' }
    }
    throw new Error('pdf-parse returned no text')
  } catch (error) {
    if (error instanceof DocumentIngestionLimitError) {
      throw error
    }
    console.warn(JSON.stringify({
      message: 'pdf-parse failed; using Cloudflare Markdown conversion',
      error: errorMessage(error)
    }))
    const pages = await extractWithCloudflare(source, name, blob)
    if (pages.length === 0) {
      throw new Error('No text could be extracted from the PDF', { cause: error })
    }
    return { pages, method: 'cloudflare-markdown' }
  }
}

function validateExtractedPages(pages: ExtractedPage[]): ExtractedPage[] {
  if (pages.length > MAX_PDF_PAGES) {
    throw new DocumentIngestionLimitError(`The PDF exceeds the ${MAX_PDF_PAGES}-page ingestion limit`)
  }

  let totalCharacters = 0
  const normalizedPages = pages.flatMap((page) => {
    // Remove NUL and non-whitespace C0 controls before content reaches D1,
    // Vectorize, the UI, or a downstream model prompt.
    const text = stripUnsafeControlCharacters(page.text).trim()
    if (!text) return []

    totalCharacters += text.length
    if (totalCharacters > MAX_EXTRACTED_CHARACTERS) {
      throw new DocumentIngestionLimitError(`The PDF exceeds the ${MAX_EXTRACTED_CHARACTERS.toLocaleString('en-US')}-character ingestion limit`)
    }
    return [{ pageNumber: page.pageNumber, text }]
  })

  if (normalizedPages.length === 0) {
    throw new Error('No text could be extracted from the PDF')
  }
  return normalizedPages
}

async function prepareChunks(
  checksum: string,
  ingestionId: string,
  pages: ExtractedPage[]
): Promise<PreparedChunk[]> {
  const { RecursiveCharacterTextSplitter } = await import('@langchain/textsplitters')
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
    separators: ['\n\n', '\n', '. ', ' ', '']
  })
  const chunks: PreparedChunk[] = []
  const seenContent = new Set<string>()
  let chunkIndex = 0

  for (const page of pages) {
    const pageChunks = await splitter.splitText(page.text)
    let searchStart = 0
    for (const rawChunk of pageChunks) {
      const textContent = rawChunk.trim()
      if (textContent.length < 30) {
        continue
      }

      const contentHash = await sha256(textContent.replace(/\s+/g, ' ').toLowerCase())
      if (seenContent.has(contentHash)) {
        continue
      }
      seenContent.add(contentHash)

      const foundAt = page.text.indexOf(textContent, Math.max(0, searchStart - 180))
      const charStart = foundAt >= 0 ? foundAt : null
      const charEnd = charStart === null ? null : charStart + textContent.length
      if (charEnd !== null) {
        searchStart = charEnd
      }

      // Generation-specific IDs keep a worker that lost its lease from
      // deleting or overwriting vectors created by its successor.
      const vectorId = await sha256(`${checksum}:${ingestionId}:${page.pageNumber}:${chunkIndex}`)
      chunks.push({
        id: vectorId,
        vectorId,
        chunkIndex,
        pageNumber: page.pageNumber,
        textContent,
        charStart,
        charEnd,
        tokenCount: Math.ceil(textContent.length / 4),
        contentHash
      })
      if (chunks.length > MAX_DOCUMENT_CHUNKS) {
        throw new DocumentIngestionLimitError(`The PDF exceeds the ${MAX_DOCUMENT_CHUNKS}-chunk ingestion limit`)
      }
      chunkIndex += 1
    }
  }
  return chunks
}

async function mapWithConcurrency<Item, Result>(
  items: Item[],
  concurrency: number,
  mapper: (item: Item, index: number) => Promise<Result>
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

function inBatches<Item>(items: Item[], size: number): Item[][] {
  const batches: Item[][] = []
  for (let offset = 0; offset < items.length; offset += size) {
    batches.push(items.slice(offset, offset + size))
  }
  return batches
}

async function deleteVectors(vectorize: Vectorize, ids: string[]): Promise<string[]> {
  const mutationIds: string[] = []
  for (const batch of inBatches(ids, 1000)) {
    if (batch.length > 0) {
      const mutation = await vectorize.deleteByIds(batch)
      mutationIds.push(mutation.mutationId)
    }
  }
  return mutationIds
}

async function waitForVectorDeletion(
  vectorize: Vectorize,
  ids: string[],
  renewLease: () => Promise<void>
): Promise<void> {
  let pending = ids
  const deadline = Date.now() + VECTOR_VISIBILITY_TIMEOUT_MS

  while (pending.length > 0) {
    await renewLease()
    const stillVisible: string[] = []
    for (const batch of inBatches(pending, 100)) {
      const visible = await vectorize.getByIds(batch)
      stillVisible.push(...visible.map(vector => vector.id))
    }
    if (stillVisible.length === 0) {
      return
    }
    if (Date.now() >= deadline) {
      throw new Error(`Vectorize did not remove ${stillVisible.length} vectors before the visibility timeout`)
    }
    pending = stillVisible
    await new Promise(resolve => setTimeout(resolve, VECTOR_VISIBILITY_POLL_MS))
  }
}

async function waitForVectors(
  vectorize: Vectorize,
  chunks: PreparedChunk[],
  uploadId: string,
  ingestionId: string,
  embeddingModel: string,
  renewLease: () => Promise<void>,
  onProgress?: (current: number, total: number) => Promise<void>
): Promise<void> {
  const pending = new Map(chunks.map(chunk => [chunk.vectorId, chunk.contentHash]))
  const total = pending.size
  const deadline = Date.now() + VECTOR_VISIBILITY_TIMEOUT_MS

  await onProgress?.(0, total)

  while (pending.size > 0) {
    await renewLease()
    for (const batch of inBatches(Array.from(pending.keys()), 100)) {
      const visible = await vectorize.getByIds(batch)
      for (const vector of visible) {
        const expectedContentHash = pending.get(vector.id)
        const metadata = vector.metadata as Record<string, unknown> | undefined
        if (expectedContentHash
          && vector.namespace === ingestionId
          && metadata?.upload_id === uploadId
          && metadata?.ingestion_id === ingestionId
          && metadata?.content_hash === expectedContentHash
          && metadata?.embedding_model === embeddingModel) {
          pending.delete(vector.id)
        }
      }
    }

    if (pending.size === 0) {
      await onProgress?.(total, total)
      return
    }
    if (Date.now() >= deadline) {
      throw new Error(`Vectorize did not make ${pending.size} current-generation vectors queryable before the visibility timeout`)
    }

    await onProgress?.(total - pending.size, total)
    await new Promise(resolve => setTimeout(resolve, VECTOR_VISIBILITY_POLL_MS))
  }
}

function leaseOwnershipCondition(lease: DocumentIngestionLease, now: Date) {
  return exists(
    db.select({ leaseName: schema.documentIngestionLeases.leaseName })
      .from(schema.documentIngestionLeases)
      .where(and(
        eq(schema.documentIngestionLeases.leaseName, DOCUMENT_INGESTION_LEASE_NAME),
        eq(schema.documentIngestionLeases.ownerId, lease.ingestionId),
        eq(schema.documentIngestionLeases.uploadId, lease.uploadId),
        gt(schema.documentIngestionLeases.expiresAt, now)
      ))
  )
}

async function acquireDocumentIngestionLease(uploadId: string): Promise<DocumentIngestionLease> {
  const lease: DocumentIngestionLease = {
    ingestionId: crypto.randomUUID(),
    uploadId
  }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + DOCUMENT_INGESTION_LEASE_TTL_MS)
  const [acquired] = await db.insert(schema.documentIngestionLeases).values({
    leaseName: DOCUMENT_INGESTION_LEASE_NAME,
    ownerId: lease.ingestionId,
    uploadId,
    expiresAt,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: schema.documentIngestionLeases.leaseName,
    set: {
      ownerId: lease.ingestionId,
      uploadId,
      expiresAt,
      createdAt: now,
      updatedAt: now
    },
    where: lte(schema.documentIngestionLeases.expiresAt, now)
  }).returning({ ownerId: schema.documentIngestionLeases.ownerId })

  if (acquired?.ownerId !== lease.ingestionId) {
    throw createError({ statusCode: 409, statusMessage: 'Another Library document is already being ingested' })
  }
  return lease
}

async function renewDocumentIngestionLease(lease: DocumentIngestionLease): Promise<void> {
  const now = new Date()
  const [renewed] = await db.update(schema.documentIngestionLeases).set({
    expiresAt: new Date(now.getTime() + DOCUMENT_INGESTION_LEASE_TTL_MS),
    updatedAt: now
  }).where(and(
    eq(schema.documentIngestionLeases.leaseName, DOCUMENT_INGESTION_LEASE_NAME),
    eq(schema.documentIngestionLeases.ownerId, lease.ingestionId),
    eq(schema.documentIngestionLeases.uploadId, lease.uploadId),
    gt(schema.documentIngestionLeases.expiresAt, now)
  )).returning({ ownerId: schema.documentIngestionLeases.ownerId })

  if (renewed?.ownerId !== lease.ingestionId) {
    throw new DocumentIngestionLeaseLostError()
  }
}

async function releaseDocumentIngestionLease(lease: DocumentIngestionLease): Promise<void> {
  await db.delete(schema.documentIngestionLeases).where(and(
    eq(schema.documentIngestionLeases.leaseName, DOCUMENT_INGESTION_LEASE_NAME),
    eq(schema.documentIngestionLeases.ownerId, lease.ingestionId),
    eq(schema.documentIngestionLeases.uploadId, lease.uploadId)
  ))
}

export async function ingestDocument(
  source: CloudflareBindingSource,
  uploadId: string,
  options: DocumentIngestionOptions = {}
): Promise<DocumentIngestionResult> {
  const bucket = requireCloudflareBinding(source, 'BLOB')
  const vectorize = requireCloudflareBinding(source, 'VECTORIZE')
  const config = getCloudflareConfig(source)

  const selectedUpload = await db.query.uploads.findFirst({
    where: () => eq(schema.uploads.id, uploadId)
  })

  if (!selectedUpload || selectedUpload.status === 'deleted') {
    throw createError({ statusCode: 404, statusMessage: 'Library upload not found' })
  }
  if (selectedUpload.contentType !== 'application/pdf') {
    throw createError({ statusCode: 415, statusMessage: 'Only PDF Library uploads can be ingested' })
  }

  // The published revision is already immutable and queryable. It does not
  // need the global lease for this read-only idempotent response.
  if (selectedUpload.status === 'ready' && selectedUpload.isActive && selectedUpload.ingestionId) {
    const [chunkSummary] = await db.select({ value: count() })
      .from(schema.documentChunks)
      .where(and(
        eq(schema.documentChunks.uploadId, selectedUpload.id),
        eq(schema.documentChunks.ingestionId, selectedUpload.ingestionId)
      ))

    const result: DocumentIngestionResult = {
      uploadId: selectedUpload.id,
      status: 'ready',
      pageCount: selectedUpload.pageCount || 0,
      chunkCount: chunkSummary?.value || 0,
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      extractionMethod: 'existing',
      vectorMutationIds: selectedUpload.vectorMutationId ? [selectedUpload.vectorMutationId] : [],
      alreadyIndexed: true
    }
    return result
  }

  const lease = await acquireDocumentIngestionLease(selectedUpload.id)
  const newVectorIds: string[] = []
  let preparedResult: DocumentIngestionResult | undefined
  let published = false
  let finalizationAttempted = false
  try {
    // Re-read after acquiring the singleton lease. The prior owner may have
    // completed between the initial lookup and this acquisition.
    const upload = await db.query.uploads.findFirst({
      where: () => eq(schema.uploads.id, selectedUpload.id)
    })
    if (!upload || upload.status === 'deleted') {
      throw createError({ statusCode: 404, statusMessage: 'Library upload not found' })
    }
    if (upload.status === 'ready' && upload.isActive && upload.ingestionId) {
      const [chunkSummary] = await db.select({ value: count() })
        .from(schema.documentChunks)
        .where(and(
          eq(schema.documentChunks.uploadId, upload.id),
          eq(schema.documentChunks.ingestionId, upload.ingestionId)
        ))
      const result: DocumentIngestionResult = {
        uploadId: upload.id,
        status: 'ready',
        pageCount: upload.pageCount || 0,
        chunkCount: chunkSummary?.value || 0,
        embeddingModel: config.embeddingModel,
        embeddingDimensions: config.embeddingDimensions,
        extractionMethod: 'existing',
        vectorMutationIds: upload.vectorMutationId ? [upload.vectorMutationId] : [],
        alreadyIndexed: true
      }
      return result
    }

    const claimTime = new Date()
    const [claim] = await db.update(schema.uploads).set({
      status: 'processing',
      ingestionId: lease.ingestionId,
      errorMessage: null,
      updatedAt: claimTime
    }).where(and(
      eq(schema.uploads.id, upload.id),
      ne(schema.uploads.status, 'deleted'),
      leaseOwnershipCondition(lease, claimTime)
    )).returning({ id: schema.uploads.id })

    if (!claim) {
      await renewDocumentIngestionLease(lease)
      throw createError({ statusCode: 404, statusMessage: 'Library upload not found' })
    }

    await options.onProgress?.({ stage: 'reading_pdf', current: 0, total: null })
    await renewDocumentIngestionLease(lease)
    const object = await bucket.get(upload.r2Key)
    if (!object) {
      throw new Error('The Library object is missing from R2')
    }
    if (object.size > MAX_PDF_BYTES) {
      throw new Error('The PDF exceeds the 10 MiB ingestion limit')
    }
    if (object.size !== upload.sizeBytes) {
      throw new Error('The Library object size does not match its upload record')
    }
    if (object.httpMetadata?.contentType !== 'application/pdf') {
      throw new Error('The Library object content type is not application/pdf')
    }

    const pdfBytes = new Uint8Array(await object.arrayBuffer())
    if (!isPdf(pdfBytes)) {
      throw new Error('The R2 object does not have a valid PDF signature')
    }
    const actualChecksum = await sha256Bytes(pdfBytes)
    if (actualChecksum !== upload.checksumSha256) {
      throw new Error('The Library object checksum does not match its upload record')
    }
    await options.onProgress?.({ stage: 'extracting_text', current: 0, total: null })
    await renewDocumentIngestionLease(lease)
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' })
    const extraction = await extractPdf(source, upload.originalName, pdfBlob)
    const pages = validateExtractedPages(extraction.pages)
    await options.onProgress?.({
      stage: 'extracting_text',
      current: pages.length,
      total: pages.length,
      pageCount: pages.length
    })
    await options.onProgress?.({
      stage: 'chunking_text',
      current: 0,
      total: null,
      pageCount: pages.length
    })
    await renewDocumentIngestionLease(lease)
    const chunks = await prepareChunks(upload.checksumSha256, lease.ingestionId, pages)
    if (chunks.length === 0) {
      throw new Error('No indexable chunks were produced from the PDF')
    }

    await options.onProgress?.({
      stage: 'generating_embeddings',
      current: 0,
      total: chunks.length,
      pageCount: pages.length,
      chunkCount: chunks.length
    })

    let embeddedChunkCount = 0
    const embeddings = await mapWithConcurrency(chunks, EMBEDDING_CONCURRENCY, async (chunk) => {
      await renewDocumentIngestionLease(lease)
      const embedding = await createWorkersAiEmbedding(
        source,
        chunk.textContent,
        { kind: 'document', title: upload.originalName }
      )
      embeddedChunkCount += 1
      await options.onProgress?.({
        stage: 'generating_embeddings',
        current: embeddedChunkCount,
        total: chunks.length,
        pageCount: pages.length,
        chunkCount: chunks.length
      })
      return embedding
    })

    // Stage the current generation in D1 before writing Vectorize. If the
    // isolate stops during an upsert, a takeover can discover and remove every
    // vector ID belonging to the abandoned generation.
    await options.onProgress?.({
      stage: 'saving_chunks',
      current: 0,
      total: chunks.length,
      pageCount: pages.length,
      chunkCount: chunks.length
    })
    await renewDocumentIngestionLease(lease)
    // A terminal failure clears uploads.ingestion_id, so use every chunk row
    // owned by this upload rather than relying on the last recorded generation.
    // This also repairs remnants left by an interrupted retry.
    const previousChunkRows = await db.select({ vectorId: schema.documentChunks.vectorId })
      .from(schema.documentChunks)
      .where(eq(schema.documentChunks.uploadId, upload.id))
    await deleteVectors(vectorize, previousChunkRows.map(row => row.vectorId))
    await renewDocumentIngestionLease(lease)
    const stagingTime = new Date()
    await db.delete(schema.documentChunks).where(and(
      eq(schema.documentChunks.uploadId, upload.id),
      leaseOwnershipCondition(lease, stagingTime)
    ))

    const rows = chunks.map(chunk => ({
      ...chunk,
      uploadId: upload.id,
      ingestionId: lease.ingestionId,
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      indexedAt: stagingTime,
      createdAt: stagingTime
    }))
    let savedChunkCount = 0
    for (const batch of inBatches(rows, DB_BATCH_SIZE)) {
      await renewDocumentIngestionLease(lease)
      await db.insert(schema.documentChunks).values(batch)
      savedChunkCount += batch.length
      await options.onProgress?.({
        stage: 'saving_chunks',
        current: savedChunkCount,
        total: chunks.length,
        pageCount: pages.length,
        chunkCount: chunks.length
      })
    }

    const vectorMutationIds: string[] = []
    let publishedVectorCount = 0
    await options.onProgress?.({
      stage: 'publishing_vectors',
      current: 0,
      total: chunks.length,
      pageCount: pages.length,
      chunkCount: chunks.length
    })
    for (const batch of inBatches(chunks.map((chunk, index) => ({
      id: chunk.vectorId,
      namespace: lease.ingestionId,
      values: embeddings[index]!,
      metadata: {
        upload_id: upload.id,
        source_filename: upload.originalName.slice(0, 200),
        page_number: chunk.pageNumber,
        chunk_index: chunk.chunkIndex,
        content_hash: chunk.contentHash,
        ingestion_id: lease.ingestionId,
        embedding_model: config.embeddingModel
      }
    })), VECTOR_BATCH_SIZE)) {
      await renewDocumentIngestionLease(lease)
      newVectorIds.push(...batch.map(vector => vector.id))
      const mutation = await vectorize.upsert(batch)
      vectorMutationIds.push(mutation.mutationId)
      publishedVectorCount += batch.length
      await options.onProgress?.({
        stage: 'publishing_vectors',
        current: publishedVectorCount,
        total: chunks.length,
        pageCount: pages.length,
        chunkCount: chunks.length
      })
    }

    // Vectorize acknowledges writes before they are visible to queries. Do not
    // publish this file generation until every expected marker and content hash
    // can be read back.
    await options.onProgress?.({
      stage: 'verifying_vectors',
      current: 0,
      total: chunks.length,
      pageCount: pages.length,
      chunkCount: chunks.length
    })
    await waitForVectors(
      vectorize,
      chunks,
      upload.id,
      lease.ingestionId,
      config.embeddingModel,
      () => renewDocumentIngestionLease(lease),
      (current, total) => options.onProgress?.({
        stage: 'verifying_vectors',
        current,
        total,
        pageCount: pages.length,
        chunkCount: chunks.length
      }) || Promise.resolve()
    )

    const indexedAt = new Date()
    await options.onProgress?.({
      stage: 'activating_document',
      current: chunks.length,
      total: chunks.length,
      pageCount: pages.length,
      chunkCount: chunks.length
    })
    await renewDocumentIngestionLease(lease)

    preparedResult = {
      uploadId: upload.id,
      status: 'ready',
      pageCount: pages.length,
      chunkCount: chunks.length,
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      extractionMethod: extraction.method,
      vectorMutationIds,
      alreadyIndexed: false
    }

    await renewDocumentIngestionLease(lease)
    const finalizationTime = new Date()
    finalizationAttempted = true
    await db.update(schema.uploads).set({
      status: 'ready',
      isPublic: true,
      isActive: true,
      pageCount: pages.length,
      vectorMutationId: vectorMutationIds.at(-1) || null,
      indexedAt,
      errorMessage: null,
      deletedAt: null,
      updatedAt: indexedAt
    }).where(and(
      eq(schema.uploads.id, upload.id),
      eq(schema.uploads.status, 'processing'),
      eq(schema.uploads.ingestionId, lease.ingestionId),
      leaseOwnershipCondition(lease, finalizationTime)
    ))

    const finalized = await db.query.uploads.findFirst({
      where: () => eq(schema.uploads.id, upload.id)
    })
    if (!finalized?.isActive
      || finalized.status !== 'ready'
      || finalized.ingestionId !== lease.ingestionId) {
      throw new DocumentIngestionLeaseLostError()
    }
    published = true

    await options.onProgress?.({
      stage: 'cleaning_previous',
      current: 0,
      total: 0,
      pageCount: pages.length,
      chunkCount: chunks.length
    })
    return preparedResult
  } catch (error) {
    if (published) {
      throw error
    }

    // A D1 batch response can fail after its transaction committed. Never
    // interpret a failed or inconclusive reconciliation read as permission to
    // remove data: only an authoritative processing/current-generation row and
    // a successfully renewed owner lease permit rollback.
    let authoritativeUpload
    try {
      authoritativeUpload = await db.query.uploads.findFirst({
        where: () => eq(schema.uploads.id, lease.uploadId)
      })
    } catch (reconciliationError) {
      console.error(JSON.stringify({
        message: 'Document ingestion rollback skipped because final state could not be reconciled',
        uploadId: lease.uploadId,
        ingestionId: lease.ingestionId,
        finalizationAttempted,
        error: errorMessage(reconciliationError)
      }))
      throw error
    }

    if (finalizationAttempted
      && preparedResult
      && authoritativeUpload?.isActive
      && authoritativeUpload.status === 'ready'
      && authoritativeUpload.ingestionId === lease.ingestionId) {
      return preparedResult
    }

    const rollbackProven = authoritativeUpload?.status === 'processing'
      && authoritativeUpload.ingestionId === lease.ingestionId

    if (rollbackProven) {
      try {
        // Cleanup is permitted only while this generation still owns the live
        // lease. Rows are additionally generation-filtered, and vector IDs are
        // generation-specific, so a successor's data cannot be removed.
        await renewDocumentIngestionLease(lease)
        await deleteVectors(vectorize, newVectorIds)
        const cleanupTime = new Date()
        await db.delete(schema.documentChunks).where(and(
          eq(schema.documentChunks.uploadId, lease.uploadId),
          eq(schema.documentChunks.ingestionId, lease.ingestionId),
          leaseOwnershipCondition(lease, cleanupTime)
        ))
        await db.update(schema.uploads).set({
          status: 'failed',
          isActive: false,
          ingestionId: null,
          errorMessage: errorMessage(error).slice(0, 1000),
          updatedAt: cleanupTime
        }).where(and(
          eq(schema.uploads.id, lease.uploadId),
          eq(schema.uploads.status, 'processing'),
          eq(schema.uploads.ingestionId, lease.ingestionId),
          leaseOwnershipCondition(lease, cleanupTime)
        ))
      } catch (cleanupError) {
        if (!(cleanupError instanceof DocumentIngestionLeaseLostError)) {
          console.error(JSON.stringify({
            message: 'Document ingestion cleanup failed',
            uploadId: lease.uploadId,
            ingestionId: lease.ingestionId,
            error: errorMessage(cleanupError)
          }))
        }
      }
    }
    throw error
  } finally {
    try {
      await releaseDocumentIngestionLease(lease)
    } catch (releaseError) {
      console.error(JSON.stringify({
        message: 'Document ingestion lease release failed',
        uploadId: lease.uploadId,
        ingestionId: lease.ingestionId,
        error: errorMessage(releaseError)
      }))
    }
  }
}

export type DocumentDeletionResult = {
  uploadId: string
  deletedVectorCount: number
  vectorMutationIds: string[]
  alreadyDeleted: boolean
}

export async function deleteDocument(source: CloudflareBindingSource, uploadId: string): Promise<DocumentDeletionResult> {
  const existing = await db.query.uploads.findFirst({
    where: () => eq(schema.uploads.id, uploadId)
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Library upload not found' })
  }
  if (existing.role === 'resume') {
    throw createError({
      statusCode: 409,
      statusMessage: 'The resume cannot be deleted as a document; replace it from the Resume PDF control'
    })
  }
  if (existing.status === 'deleted') {
    return {
      uploadId,
      deletedVectorCount: 0,
      vectorMutationIds: [],
      alreadyDeleted: true
    }
  }

  const vectorize = requireCloudflareBinding(source, 'VECTORIZE')
  const bucket = requireCloudflareBinding(source, 'BLOB')
  const lease = await acquireDocumentIngestionLease(uploadId)

  try {
    const upload = await db.query.uploads.findFirst({
      where: () => eq(schema.uploads.id, uploadId)
    })
    if (!upload) {
      throw createError({ statusCode: 404, statusMessage: 'Library upload not found' })
    }
    if (upload.status === 'deleted') {
      return {
        uploadId,
        deletedVectorCount: 0,
        vectorMutationIds: [],
        alreadyDeleted: true
      }
    }

    const chunks = await db.select({ vectorId: schema.documentChunks.vectorId })
      .from(schema.documentChunks)
      .where(eq(schema.documentChunks.uploadId, upload.id))
    const vectorIds = chunks.map(chunk => chunk.vectorId)
    const vectorMutationIds = await deleteVectors(vectorize, vectorIds)
    await waitForVectorDeletion(
      vectorize,
      vectorIds,
      () => renewDocumentIngestionLease(lease)
    )

    await renewDocumentIngestionLease(lease)
    await bucket.delete(upload.r2Key)
    await renewDocumentIngestionLease(lease)

    const deletedAt = new Date()
    await db.batch([
      db.delete(schema.documentChunks).where(and(
        eq(schema.documentChunks.uploadId, upload.id),
        leaseOwnershipCondition(lease, deletedAt)
      )),
      db.update(schema.uploads).set({
        status: 'deleted',
        isActive: false,
        pageCount: null,
        vectorMutationId: null,
        ingestionId: null,
        indexedAt: null,
        errorMessage: null,
        deletedAt,
        updatedAt: deletedAt
      }).where(and(
        eq(schema.uploads.id, upload.id),
        ne(schema.uploads.status, 'deleted'),
        leaseOwnershipCondition(lease, deletedAt)
      ))
    ])

    const deleted = await db.query.uploads.findFirst({
      where: () => eq(schema.uploads.id, upload.id)
    })
    if (deleted?.status !== 'deleted') {
      throw new DocumentIngestionLeaseLostError()
    }

    return {
      uploadId: upload.id,
      deletedVectorCount: vectorIds.length,
      vectorMutationIds,
      alreadyDeleted: false
    }
  } finally {
    try {
      await releaseDocumentIngestionLease(lease)
    } catch (releaseError) {
      console.error(JSON.stringify({
        message: 'Document deletion lease release failed',
        uploadId,
        error: errorMessage(releaseError)
      }))
    }
  }
}
