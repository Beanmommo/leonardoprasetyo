import type { UIMessage } from 'ai'

const CHATS_STORAGE_KEY = 'leonardoprasetyo:portfolio-chats:v1'
const QUOTA_STORAGE_KEY = 'leonardoprasetyo:portfolio-chat-quota:v1'
const MAX_LOCAL_CHATS = 50

export interface LocalChat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: UIMessage[]
  pendingResponse?: boolean
}

// Last-known response metadata for display only. The server must re-evaluate
// the current public IP for every explicit question.
export interface PublicChatQuota {
  limit: number
  remaining: number
  resetAt: string | null
  updatedAt: string
}

let storageListenerAttached = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function sanitizeMessageParts(value: unknown): UIMessage['parts'] {
  if (!Array.isArray(value)) return []

  return value.flatMap((part) => {
    if (!isRecord(part) || typeof part.type !== 'string') return []

    if (part.type === 'text' && typeof part.text === 'string') {
      return [{
        type: 'text' as const,
        text: part.text,
        state: part.state === 'streaming' || part.state === 'done' ? 'done' as const : undefined
      }]
    }

    if (part.type === 'data-citations' && Array.isArray(part.data)) {
      return [{ type: 'data-citations' as const, data: part.data } as UIMessage['parts'][number]]
    }

    return []
  })
}

function sanitizeMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((message) => {
    if (!isRecord(message)) return []
    if (message.role !== 'user' && message.role !== 'assistant') return []
    if (typeof message.id !== 'string' || !Array.isArray(message.parts)) return []

    const parts = sanitizeMessageParts(message.parts)
    if (parts.length === 0) return []

    return [{
      id: message.id,
      role: message.role,
      parts
    } satisfies UIMessage]
  }).slice(-100)
}

function sanitizeChat(value: unknown): LocalChat | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null

  const createdAt = isValidDate(value.createdAt) ? value.createdAt : new Date().toISOString()
  const updatedAt = isValidDate(value.updatedAt) ? value.updatedAt : createdAt

  return {
    id: value.id,
    title: typeof value.title === 'string' && value.title.trim()
      ? value.title.trim().slice(0, 80)
      : 'Untitled',
    createdAt,
    updatedAt,
    messages: sanitizeMessages(value.messages),
    pendingResponse: value.pendingResponse === true
  }
}

function parseChats(value: string | null): LocalChat[] {
  if (!value) return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(sanitizeChat)
      .filter((chat): chat is LocalChat => chat !== null)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, MAX_LOCAL_CHATS)
  } catch {
    return []
  }
}

function parseQuota(value: string | null): PublicChatQuota | null {
  if (!value) return null

  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return null
    if (typeof parsed.limit !== 'number' || typeof parsed.remaining !== 'number') return null
    const { limit, remaining } = parsed
    if (
      !Number.isSafeInteger(limit)
      || limit < 1
      || limit > 5
      || !Number.isSafeInteger(remaining)
      || remaining < 0
      || remaining > limit
    ) return null

    const resetAt = isValidDate(parsed.resetAt) ? parsed.resetAt : null
    if (!resetAt || Date.parse(resetAt) <= Date.now()) {
      return null
    }

    return {
      limit,
      remaining,
      resetAt,
      updatedAt: isValidDate(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString()
    }
  } catch {
    return null
  }
}

function titleFromQuestion(question: string): string {
  const compact = question.trim().replace(/\s+/g, ' ')
  if (compact.length <= 56) return compact
  return `${compact.slice(0, 53).trimEnd()}...`
}

function parseResetHeader(value: string | null): string | null {
  if (!value) return null

  if (/^\d+$/.test(value)) {
    const numeric = Number(value)
    const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function useLocalChats() {
  const chats = useState<LocalChat[]>('portfolio-local-chats', () => [])
  const hydrated = useState<boolean>('portfolio-local-chats-hydrated', () => false)
  const storageError = useState<string | null>('portfolio-local-chats-error', () => null)
  const quota = useState<PublicChatQuota | null>('portfolio-chat-quota', () => null)

  function persistChats() {
    if (!import.meta.client) return

    try {
      localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats.value))
      storageError.value = null
    } catch {
      storageError.value = 'This browser could not save chat history. You can keep chatting, but this conversation may not survive a refresh.'
    }
  }

  function persistQuota() {
    if (!import.meta.client) return

    try {
      if (quota.value) {
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(quota.value))
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY)
      }
    } catch {
      // Chat persistence errors are surfaced separately; quota state is only a convenience.
    }
  }

  function hydrate() {
    if (!import.meta.client) return

    try {
      chats.value = parseChats(localStorage.getItem(CHATS_STORAGE_KEY))
      quota.value = parseQuota(localStorage.getItem(QUOTA_STORAGE_KEY))
      storageError.value = null
    } catch {
      chats.value = []
      quota.value = null
      storageError.value = 'Browser storage is unavailable. You can keep chatting, but this conversation may not survive a refresh.'
    }
    hydrated.value = true

    if (!storageListenerAttached) {
      window.addEventListener('storage', (event) => {
        if (event.key === CHATS_STORAGE_KEY) {
          chats.value = parseChats(event.newValue)
        }

        if (event.key === QUOTA_STORAGE_KEY) {
          quota.value = parseQuota(event.newValue)
        }
      })
      storageListenerAttached = true
    }
  }

  function commit(nextChats: LocalChat[]) {
    chats.value = nextChats
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, MAX_LOCAL_CHATS)
    persistChats()
  }

  function createChat(question: string): LocalChat {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const chat: LocalChat = {
      id,
      title: titleFromQuestion(question),
      createdAt: now,
      updatedAt: now,
      pendingResponse: true,
      messages: [{
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: question.trim() }]
      }]
    }

    commit([chat, ...chats.value.filter(item => item.id !== id)])
    return chat
  }

  function getChat(id: string): LocalChat | undefined {
    return chats.value.find(chat => chat.id === id)
  }

  function saveMessages(id: string, messages: UIMessage[]) {
    const sanitized = sanitizeMessages(messages)
    const now = new Date().toISOString()

    commit(chats.value.map(chat => chat.id === id
      ? { ...chat, messages: sanitized, updatedAt: now }
      : chat))
  }

  function consumePendingResponse(id: string): boolean {
    const chat = getChat(id)
    if (!chat?.pendingResponse) return false

    commit(chats.value.map(item => item.id === id
      ? { ...item, pendingResponse: false }
      : item))
    return true
  }

  function renameChat(id: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return

    commit(chats.value.map(chat => chat.id === id
      ? { ...chat, title: trimmed.slice(0, 80), updatedAt: new Date().toISOString() }
      : chat))
  }

  function deleteChat(id: string) {
    commit(chats.value.filter(chat => chat.id !== id))
  }

  function updateQuotaFromHeaders(headers: Headers) {
    const limitHeader = headers.get('X-RateLimit-Limit')
    const remainingHeader = headers.get('X-RateLimit-Remaining')
    const resetHeader = headers.get('X-RateLimit-Reset')
    if (limitHeader === null || remainingHeader === null || resetHeader === null) return

    const limit = Number(limitHeader)
    const remaining = Number(remainingHeader)
    const resetAt = parseResetHeader(resetHeader)
    if (
      !Number.isSafeInteger(limit)
      || limit < 1
      || limit > 5
      || !Number.isSafeInteger(remaining)
      || remaining < 0
      || remaining > limit
      || !resetAt
    ) return

    quota.value = {
      limit,
      remaining,
      resetAt,
      updatedAt: new Date().toISOString()
    }
    persistQuota()
  }

  return {
    chats,
    hydrated,
    storageError,
    quota,
    hydrate,
    createChat,
    getChat,
    saveMessages,
    consumePendingResponse,
    renameChat,
    deleteChat,
    updateQuotaFromHeaders
  }
}
