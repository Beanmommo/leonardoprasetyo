import type { getCloudflareBindings } from './cloudflareBindings'

type D1Binding = NonNullable<ReturnType<typeof getCloudflareBindings>['DB']>

interface QuestionUsageRow {
  question_count: number
}

export interface DailyQuestionReservation {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: string
  resetEpochSeconds: number
}

const textEncoder = new TextEncoder()

/**
 * Canonicalise Cloudflare's client IP before deriving the stable, non-reversible
 * identifier used by the daily quota table.
 */
export function normalizeClientIp(rawIp: string): string {
  const value = rawIp.trim()

  const ipv4Parts = value.split('.')
  if (ipv4Parts.length === 4 && ipv4Parts.every(part => /^\d{1,3}$/.test(part))) {
    const octets = ipv4Parts.map(Number)
    if (octets.every(octet => octet >= 0 && octet <= 255)) {
      return octets.join('.')
    }
  }

  const ipv6 = value.startsWith('[') && value.endsWith(']')
    ? value.slice(1, -1)
    : value

  if (ipv6.includes(':') && !ipv6.includes('%')) {
    try {
      const hostname = new URL(`http://[${ipv6}]/`).hostname
      if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1).toLowerCase()
      }
    } catch {
      // Fall through to the validation error below.
    }
  }

  throw new Error('CF-Connecting-IP is not a valid IP address')
}

export async function hashClientIp(rawIp: string, secret: string): Promise<string> {
  const secretBytes = textEncoder.encode(secret)
  if (secretBytes.byteLength < 32) {
    throw new Error('IP_HASH_SECRET must contain at least 32 bytes')
  }

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(normalizeClientIp(rawIp))
  )

  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function getUtcQuestionWindow(now = new Date()): {
  usageDateUtc: string
  resetAt: string
  resetEpochSeconds: number
} {
  const usageDateUtc = now.toISOString().slice(0, 10)
  const reset = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ))

  return {
    usageDateUtc,
    resetAt: reset.toISOString(),
    resetEpochSeconds: Math.floor(reset.getTime() / 1000)
  }
}

/**
 * Reserve quota before any paid provider work. The conditional upsert and
 * RETURNING execute as one D1 statement, so concurrent requests cannot both
 * pass a read-then-write check at the boundary.
 */
export async function reserveDailyQuestion(options: {
  db: D1Binding
  rawIp: string
  ipHashSecret: string
  limit: number
  now?: Date
}): Promise<DailyQuestionReservation> {
  const { db, rawIp, ipHashSecret, limit, now = new Date() } = options
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) {
    throw new Error('QUESTION_DAILY_LIMIT must be an integer from 1 to 5')
  }

  const ipHash = await hashClientIp(rawIp, ipHashSecret)
  const { usageDateUtc, resetAt, resetEpochSeconds } = getUtcQuestionWindow(now)
  const row = await db.prepare(`
    INSERT INTO question_usage (
      usage_date_utc,
      ip_hash,
      question_count,
      updated_at
    ) VALUES (?, ?, 1, unixepoch())
    ON CONFLICT (usage_date_utc, ip_hash) DO UPDATE SET
      question_count = question_usage.question_count + 1,
      updated_at = unixepoch()
    WHERE question_usage.question_count < ?
    RETURNING question_count
  `).bind(usageDateUtc, ipHash, limit).first<QuestionUsageRow>()

  if (!row) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      resetEpochSeconds
    }
  }

  const questionCount = Number(row.question_count)
  if (!Number.isSafeInteger(questionCount) || questionCount < 1 || questionCount > limit) {
    throw new Error('D1 returned an invalid daily question count')
  }

  return {
    allowed: true,
    limit,
    remaining: limit - questionCount,
    resetAt,
    resetEpochSeconds
  }
}
