import { Buffer } from 'node:buffer'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { useNitroApp } from 'nitropack/runtime'
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { ingestDocument } from '../utils/documentIngestion'
import {
  completeIndexingTask,
  failIndexingTask,
  startIndexingTask,
  updateIndexingTaskProgress
} from '../utils/indexingTasks'

const CHAT_BODY_LIMIT = 64 * 1024
const ADMIN_INGEST_BODY_LIMIT = 16 * 1024
const DOCUMENT_PDF_BODY_LIMIT = 10 * 1024 * 1024
const DEFAULT_BODY_LIMIT = 1024 * 1024

const nitroApp = useNitroApp()

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function workflowFailureMessage(event, error) {
  return `Cloudflare Workflow ${event.workflowName}/${event.instanceId} failed: ${errorMessage(error)}`
}

export class LibraryIndexingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const taskId = event.payload?.taskId
    const uploadId = event.payload?.uploadId
    if (typeof taskId !== 'string' || typeof uploadId !== 'string') {
      throw new Error('Invalid Library indexing workflow payload')
    }

    // NuxtHub's generated database adapter resolves the D1 binding from this
    // environment. Development and production run this same code; Wrangler
    // selects which D1/R2/Vectorize resources are bound to the Worker.
    globalThis.__env__ = this.env

    try {
      await step.do('validate Library indexing task', async () => {
        const task = await db.query.indexingTasks.findFirst({
          where: () => eq(schema.indexingTasks.id, taskId)
        })
        if (!task || task.uploadId !== uploadId) {
          throw new NonRetryableError('Indexing task not found')
        }
        return { taskId, uploadId }
      })

      const result = await step.do('index Library source', {
        retries: {
          limit: 2,
          delay: '5 seconds',
          backoff: 'exponential'
        }
      }, async (stepContext) => {
        await startIndexingTask(taskId)
        try {
          return await ingestDocument(this.env, uploadId, {
            onProgress: progress => updateIndexingTaskProgress(taskId, progress)
          })
        } catch (error) {
          console.error(JSON.stringify({
            message: 'Indexing workflow attempt failed',
            workflowName: event.workflowName,
            workflowInstanceId: event.instanceId,
            taskId,
            uploadId,
            attempt: stepContext.attempt,
            error: errorMessage(error)
          }))
          throw error
        }
      })

      await step.do('complete Library indexing task', async () => {
        await completeIndexingTask(taskId, result)
        return { taskId, status: 'ready' }
      })

      return { taskId, result }
    } catch (error) {
      const failureMessage = workflowFailureMessage(event, error)
      try {
        await step.do('record Library indexing failure', {
          retries: {
            limit: 5,
            delay: '2 seconds',
            backoff: 'exponential'
          },
          timeout: '1 minute'
        }, async () => {
          await failIndexingTask(taskId, failureMessage)
          return { taskId, status: 'failed', errorMessage: failureMessage }
        })
      } catch (recordError) {
        console.error(JSON.stringify({
          message: 'Could not record terminal Library indexing workflow failure',
          workflowName: event.workflowName,
          workflowInstanceId: event.instanceId,
          taskId,
          workflowError: errorMessage(error),
          error: errorMessage(recordError)
        }))
      }
      throw error
    }
  }
}

class RequestBodyTooLarge extends Error {
  constructor(limit) {
    super(`Request body exceeds the ${limit}-byte limit`)
    this.limit = limit
  }
}

function jsonError(status, message, extraHeaders = {}) {
  return Response.json({ statusCode: status, statusMessage: message }, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders }
  })
}

function normalizePathname(pathname) {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '') || '/'
}

function bodyLimit(pathname) {
  if (pathname === '/api/chat') return CHAT_BODY_LIMIT
  if (pathname === '/api/admin/library/files') return DOCUMENT_PDF_BODY_LIMIT
  if (pathname === '/api/admin/library/resume') return DOCUMENT_PDF_BODY_LIMIT
  if (pathname === '/api/admin/library/ingest') return ADMIN_INGEST_BODY_LIMIT
  return DEFAULT_BODY_LIMIT
}

async function readBoundedBody(request, limit) {
  if (!request.body) return undefined

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > limit) {
      throw new RequestBodyTooLarge(limit)
    }
  }

  const reader = request.body.getReader()
  const chunks = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    total += value.byteLength
    if (total > limit) {
      await reader.cancel('Request body limit exceeded').catch(() => {})
      throw new RequestBodyTooLarge(limit)
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
  }

  return Buffer.concat(chunks, total)
}

async function fetchHandler(request, env, context) {
  const url = new URL(request.url)
  url.pathname = normalizePathname(url.pathname)

  if (env.ASSETS && isPublicAssetURL(url.pathname)) {
    return env.ASSETS.fetch(request)
  }

  if (
    url.pathname === '/api/chats'
    || url.pathname.startsWith('/api/chats/')
    || url.pathname === '/api/upload'
    || url.pathname.startsWith('/api/upload/')
  ) {
    return jsonError(410, 'This legacy server-persistence route has been retired')
  }

  let body
  try {
    body = await readBoundedBody(request, bodyLimit(url.pathname))
  } catch (error) {
    if (error instanceof RequestBodyTooLarge) {
      return jsonError(413, error.message)
    }
    throw error
  }

  globalThis.__env__ = env
  return nitroApp.localFetch(url.pathname + url.search, {
    context: {
      waitUntil: promise => context.waitUntil(promise),
      _platform: {
        cf: request.cf,
        cloudflare: { request, env, context, url }
      }
    },
    host: url.hostname,
    protocol: url.protocol,
    method: request.method,
    headers: request.headers,
    body
  })
}

export default {
  fetch: fetchHandler,
  scheduled(controller, env, context) {
    globalThis.__env__ = env
    context.waitUntil(nitroApp.hooks.callHook('cloudflare:scheduled', {
      controller,
      env,
      context
    }))
  }
}
