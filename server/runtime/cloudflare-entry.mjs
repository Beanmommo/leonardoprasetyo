import { Buffer } from 'node:buffer'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { useNitroApp } from 'nitropack/runtime'
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'

const CHAT_BODY_LIMIT = 64 * 1024
const ADMIN_INGEST_BODY_LIMIT = 16 * 1024
const DOCUMENT_PDF_BODY_LIMIT = 10 * 1024 * 1024
const DEFAULT_BODY_LIMIT = 1024 * 1024

const nitroApp = useNitroApp()

function workflowLocalFetch(path, env, init = {}) {
  globalThis.__env__ = env
  return nitroApp.localFetch(path, {
    ...init,
    context: {
      indexingWorkflow: true,
      cloudflare: { env }
    }
  })
}

export class LibraryIndexingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const taskId = event.payload?.taskId
    const uploadId = event.payload?.uploadId
    if (typeof taskId !== 'string' || typeof uploadId !== 'string') {
      throw new Error('Invalid Library indexing workflow payload')
    }

    try {
      return await step.do('index Library document', {
        retries: {
          limit: 2,
          delay: '5 seconds',
          backoff: 'exponential'
        }
      }, async () => {
        const response = await workflowLocalFetch(
          `/api/internal/library/tasks/${encodeURIComponent(taskId)}/run`,
          this.env,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ uploadId })
          }
        )
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(body.statusMessage || body.message || `Indexing task failed with HTTP ${response.status}`)
        }
        return body
      })
    } catch (error) {
      try {
        await workflowLocalFetch(
          `/api/internal/library/tasks/${encodeURIComponent(taskId)}/fail`,
          this.env,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: error instanceof Error ? error.message : String(error)
            })
          }
        )
      } catch (recordError) {
        console.error(JSON.stringify({
          message: 'Could not record terminal Library indexing workflow failure',
          taskId,
          error: recordError instanceof Error ? recordError.message : String(recordError)
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
