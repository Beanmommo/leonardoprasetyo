import { Buffer } from 'node:buffer'
import { useNitroApp } from 'nitropack/runtime'
import { isPublicAssetURL } from '#nitro-internal-virtual/public-assets'

const CHAT_BODY_LIMIT = 64 * 1024
const ADMIN_INGEST_BODY_LIMIT = 16 * 1024
const DOCUMENT_PDF_BODY_LIMIT = 10 * 1024 * 1024
const DEFAULT_BODY_LIMIT = 1024 * 1024

const nitroApp = useNitroApp()

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

async function constantTimeTextEqual(left, right) {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

async function authorizeLibraryAdmin(request, env) {
  const expected = env.LIBRARY_ADMIN_TOKEN
  if (!expected || new TextEncoder().encode(expected).byteLength < 32) {
    return jsonError(503, 'Library administration is not configured securely')
  }

  const authorization = request.headers.get('authorization')
  const bearerToken = /^Bearer ([^\s]+)$/.exec(authorization || '')?.[1]
  const provided = bearerToken || ''
  return await constantTimeTextEqual(provided, expected)
    ? undefined
    : jsonError(401, 'Invalid library administrator token', {
        'WWW-Authenticate': 'Bearer realm="library-admin"'
      })
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

  if (url.pathname === '/api/admin/library' || url.pathname.startsWith('/api/admin/library/')) {
    const rejection = await authorizeLibraryAdmin(request, env)
    if (rejection) return rejection
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
