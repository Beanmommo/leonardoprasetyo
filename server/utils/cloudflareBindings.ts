/// <reference types="@cloudflare/workers-types" />

import type { H3Event } from 'h3'

export const CLOUDFLARE_BINDING_NAMES = ['AI', 'DB', 'BLOB', 'VECTORIZE'] as const
export const CLOUDFLARE_SECRET_NAMES = [
  'IP_HASH_SECRET',
  'LIBRARY_ADMIN_TOKEN'
] as const

export const CLOUDFLARE_CHAT_MODEL = '@cf/ibm-granite/granite-4.0-h-micro' as const
export const CLOUDFLARE_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b' as const
export const CLOUDFLARE_EMBEDDING_PROVIDER = 'workers-ai' as const
export const CLOUDFLARE_EMBEDDING_DIMENSIONS = 1024 as const

type BindingName = typeof CLOUDFLARE_BINDING_NAMES[number]
type SecretName = typeof CLOUDFLARE_SECRET_NAMES[number]

export type CloudflareRuntimeBindings = {
  AI?: Ai
  DB?: D1Database
  BLOB?: R2Bucket
  VECTORIZE?: Vectorize
  AI_GATEWAY_ID?: string
  CHAT_MODEL?: string
  EMBEDDING_PROVIDER?: string
  EMBEDDING_MODEL?: string
  EMBEDDING_DIMENSIONS?: string
  VECTORIZE_INDEX_NAME?: string
  VECTORIZE_METRIC?: string
  QUESTION_DAILY_LIMIT?: string
  IP_HASH_SECRET?: string
  LIBRARY_ADMIN_TOKEN?: string
}

export type CloudflareConfig = {
  aiGatewayId: string
  chatModel: typeof CLOUDFLARE_CHAT_MODEL
  embeddingProvider: typeof CLOUDFLARE_EMBEDDING_PROVIDER
  embeddingModel: typeof CLOUDFLARE_EMBEDDING_MODEL
  embeddingDimensions: number
  vectorizeIndexName: string
  vectorizeMetric: 'cosine' | 'euclidean' | 'dot-product'
  questionDailyLimit: number
}

type CloudflareEventContext = {
  cloudflare?: {
    env?: CloudflareRuntimeBindings
  }
}

type CloudflareGlobal = typeof globalThis & {
  __env__?: CloudflareRuntimeBindings
}

const CONFIG_DEFAULTS = {
  AI_GATEWAY_ID: 'leonardoprasetyo',
  CHAT_MODEL: CLOUDFLARE_CHAT_MODEL,
  EMBEDDING_PROVIDER: CLOUDFLARE_EMBEDDING_PROVIDER,
  EMBEDDING_MODEL: CLOUDFLARE_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS: String(CLOUDFLARE_EMBEDDING_DIMENSIONS),
  VECTORIZE_INDEX_NAME: 'leonardoprasetyo-documents-prod',
  VECTORIZE_METRIC: 'cosine',
  QUESTION_DAILY_LIMIT: '5'
} as const

function processEnvironment(): CloudflareRuntimeBindings {
  return {
    AI_GATEWAY_ID: process.env.AI_GATEWAY_ID,
    CHAT_MODEL: process.env.CHAT_MODEL,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    VECTORIZE_INDEX_NAME: process.env.VECTORIZE_INDEX_NAME,
    VECTORIZE_METRIC: process.env.VECTORIZE_METRIC,
    QUESTION_DAILY_LIMIT: process.env.QUESTION_DAILY_LIMIT,
    IP_HASH_SECRET: process.env.IP_HASH_SECRET,
    LIBRARY_ADMIN_TOKEN: process.env.LIBRARY_ADMIN_TOKEN
  }
}

export function getCloudflareBindings(event?: H3Event): Readonly<CloudflareRuntimeBindings> {
  const eventContext = event?.context as CloudflareEventContext | undefined
  const globalEnv = (globalThis as CloudflareGlobal).__env__

  return {
    ...processEnvironment(),
    ...globalEnv,
    ...eventContext?.cloudflare?.env
  }
}

export function requireCloudflareBinding<Name extends BindingName>(event: H3Event, name: Name): NonNullable<CloudflareRuntimeBindings[Name]> {
  const binding = getCloudflareBindings(event)[name]
  if (!binding) {
    throw createError({
      statusCode: 503,
      statusMessage: `Cloudflare ${name} binding is not configured`
    })
  }
  return binding as NonNullable<CloudflareRuntimeBindings[Name]>
}

export function getCloudflareSecret(event: H3Event, name: SecretName): string | undefined {
  const value = getCloudflareBindings(event)[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function getCloudflareConfig(event?: H3Event): CloudflareConfig {
  const env = getCloudflareBindings(event)
  const dimensions = Number.parseInt(env.EMBEDDING_DIMENSIONS || CONFIG_DEFAULTS.EMBEDDING_DIMENSIONS, 10)
  const dailyLimit = Number.parseInt(env.QUESTION_DAILY_LIMIT || CONFIG_DEFAULTS.QUESTION_DAILY_LIMIT, 10)
  const metric = env.VECTORIZE_METRIC || CONFIG_DEFAULTS.VECTORIZE_METRIC
  const chatModel = env.CHAT_MODEL || CONFIG_DEFAULTS.CHAT_MODEL
  const embeddingProvider = env.EMBEDDING_PROVIDER || CONFIG_DEFAULTS.EMBEDDING_PROVIDER
  const embeddingModel = env.EMBEDDING_MODEL || CONFIG_DEFAULTS.EMBEDDING_MODEL

  if (chatModel !== CLOUDFLARE_CHAT_MODEL) {
    throw new Error(`CHAT_MODEL must be ${CLOUDFLARE_CHAT_MODEL}`)
  }
  if (embeddingProvider !== CLOUDFLARE_EMBEDDING_PROVIDER) {
    throw new Error(`EMBEDDING_PROVIDER must be ${CLOUDFLARE_EMBEDDING_PROVIDER}`)
  }
  if (embeddingModel !== CLOUDFLARE_EMBEDDING_MODEL) {
    throw new Error(`EMBEDDING_MODEL must be ${CLOUDFLARE_EMBEDDING_MODEL}`)
  }
  if (dimensions !== CLOUDFLARE_EMBEDDING_DIMENSIONS) {
    throw new Error(`EMBEDDING_DIMENSIONS must be ${CLOUDFLARE_EMBEDDING_DIMENSIONS}`)
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 5) {
    throw new Error('QUESTION_DAILY_LIMIT must be an integer between 1 and 5')
  }
  if (metric !== 'cosine' && metric !== 'euclidean' && metric !== 'dot-product') {
    throw new Error('VECTORIZE_METRIC must be cosine, euclidean, or dot-product')
  }

  return {
    aiGatewayId: env.AI_GATEWAY_ID || CONFIG_DEFAULTS.AI_GATEWAY_ID,
    chatModel,
    embeddingProvider,
    embeddingModel,
    embeddingDimensions: dimensions,
    vectorizeIndexName: env.VECTORIZE_INDEX_NAME || CONFIG_DEFAULTS.VECTORIZE_INDEX_NAME,
    vectorizeMetric: metric,
    questionDailyLimit: dailyLimit
  }
}

async function constantTimeTextEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  const workersSubtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean
  }
  if (typeof workersSubtle.timingSafeEqual === 'function') {
    return workersSubtle.timingSafeEqual(leftHash, rightHash)
  }
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!
  }
  return difference === 0
}

export async function assertLibraryAdmin(event: H3Event): Promise<void> {
  const expected = getCloudflareSecret(event, 'LIBRARY_ADMIN_TOKEN')
  if (!expected || new TextEncoder().encode(expected).byteLength < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Library administration is not configured securely' })
  }

  const authorization = getRequestHeader(event, 'authorization')
  const bearerToken = /^Bearer ([^\s]+)$/.exec(authorization || '')?.[1]
  const provided = bearerToken || ''

  if (!(await constantTimeTextEqual(provided, expected))) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer realm="library-admin"')
    throw createError({ statusCode: 401, statusMessage: 'Invalid library administrator token' })
  }
}
