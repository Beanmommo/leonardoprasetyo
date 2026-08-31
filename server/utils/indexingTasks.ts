import { db, schema } from 'hub:db'
import { eq, sql } from 'drizzle-orm'
import type { DocumentIngestionResult } from './documentIngestion'

type IndexingTaskRow = typeof schema.indexingTasks.$inferSelect

export type IndexingTaskStage = IndexingTaskRow['stage']

export type IndexingTaskProgress = {
  stage: Exclude<IndexingTaskStage, 'complete' | 'failed'>
  current?: number
  total?: number | null
  pageCount?: number
  chunkCount?: number
}

export type AdminIndexingTask = {
  id: string
  uploadId: string
  originalName: string
  workflowInstanceId: string
  status: IndexingTaskRow['status']
  stage: IndexingTaskStage
  progressCurrent: number
  progressTotal: number | null
  pageCount: number | null
  chunkCount: number | null
  embeddingModel: string | null
  embeddingDimensions: number | null
  extractionMethod: IndexingTaskRow['extractionMethod']
  attempt: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  contentUrl: string
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

export function serializeIndexingTask(task: IndexingTaskRow, originalName: string): AdminIndexingTask {
  return {
    id: task.id,
    uploadId: task.uploadId,
    originalName,
    workflowInstanceId: task.workflowInstanceId,
    status: task.status,
    stage: task.stage,
    progressCurrent: task.progressCurrent,
    progressTotal: task.progressTotal,
    pageCount: task.pageCount,
    chunkCount: task.chunkCount,
    embeddingModel: task.embeddingModel,
    embeddingDimensions: task.embeddingDimensions,
    extractionMethod: task.extractionMethod,
    attempt: task.attempt,
    errorMessage: task.errorMessage,
    startedAt: dateToIso(task.startedAt),
    completedAt: dateToIso(task.completedAt),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    contentUrl: `/api/admin/library/files/${task.uploadId}/content`
  }
}

export async function startIndexingTask(taskId: string): Promise<void> {
  const task = await db.query.indexingTasks.findFirst({
    where: () => eq(schema.indexingTasks.id, taskId)
  })
  if (!task) {
    throw new Error('Indexing task not found')
  }

  const now = new Date()
  await db.update(schema.indexingTasks).set({
    status: 'processing',
    stage: 'reading_pdf',
    progressCurrent: 0,
    progressTotal: null,
    attempt: sql`${schema.indexingTasks.attempt} + 1`,
    errorMessage: null,
    startedAt: task.startedAt || now,
    completedAt: null,
    updatedAt: now
  }).where(eq(schema.indexingTasks.id, taskId))
}

export async function updateIndexingTaskProgress(taskId: string, progress: IndexingTaskProgress): Promise<void> {
  const now = new Date()
  await db.update(schema.indexingTasks).set({
    status: 'processing',
    stage: progress.stage,
    ...(progress.current !== undefined ? { progressCurrent: progress.current } : {}),
    ...(progress.total !== undefined ? { progressTotal: progress.total } : {}),
    ...(progress.pageCount !== undefined ? { pageCount: progress.pageCount } : {}),
    ...(progress.chunkCount !== undefined ? { chunkCount: progress.chunkCount } : {}),
    updatedAt: now
  }).where(eq(schema.indexingTasks.id, taskId))
}

export async function completeIndexingTask(taskId: string, result: DocumentIngestionResult): Promise<void> {
  const now = new Date()
  await db.update(schema.indexingTasks).set({
    status: 'ready',
    stage: 'complete',
    progressCurrent: result.chunkCount,
    progressTotal: result.chunkCount,
    pageCount: result.pageCount,
    chunkCount: result.chunkCount,
    embeddingModel: result.embeddingModel,
    embeddingDimensions: result.embeddingDimensions,
    extractionMethod: result.extractionMethod,
    errorMessage: null,
    completedAt: now,
    updatedAt: now
  }).where(eq(schema.indexingTasks.id, taskId))
}

export async function failIndexingTask(taskId: string, error: unknown): Promise<void> {
  const now = new Date()
  const message = error instanceof Error ? error.message : String(error)
  await db.update(schema.indexingTasks).set({
    status: 'failed',
    errorMessage: message.slice(0, 1000),
    completedAt: now,
    updatedAt: now
  }).where(eq(schema.indexingTasks.id, taskId))
}
