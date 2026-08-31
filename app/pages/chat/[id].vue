<script setup lang="ts">
import { useChat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useNow } from '@vueuse/core'

interface PortfolioCitation {
  id?: string
  uploadId?: string
  filename?: string
  sourceFilename?: string
  page?: number
  pageNumber?: number
  url?: string
  contentUrl?: string
  excerpt?: string
  textPreview?: string
}

type PortfolioMessage = UIMessage<unknown, { citations: PortfolioCitation[] }>

const route = useRoute()
const toast = useToast()
const chatId = computed(() => String(route.params.id))
const pageReady = ref(false)
const input = ref('')
const editingMessageId = ref<string | null>(null)
const votes = ref<Record<string, boolean | null>>({})
const pendingCitations = ref<PortfolioCitation[]>([])
const dailyLimitModalOpen = ref(false)
const dailyLimitModalShownWindow = useState<string | null>(
  'portfolio-daily-limit-modal-shown-window',
  () => null
)
const { csrf, headerName } = useCsrf()
const now = useNow({ interval: 60_000 })
const DAILY_LIMIT_MODAL_STORAGE_KEY = 'leonardoprasetyo:daily-limit-modal:v1'

const {
  hydrated,
  storageError,
  quota,
  hydrate,
  getChat,
  saveMessages,
  consumePendingResponse,
  updateQuotaFromHeaders
} = useLocalChats()

const localChat = computed(() => getChat(chatId.value))
const cachedQuotaExhausted = computed(() => {
  if (!quota.value || quota.value.remaining > 0) return false
  return !quota.value.resetAt || Date.parse(quota.value.resetAt) > now.value.getTime()
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCitations(value: unknown): PortfolioCitation[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((citation) => {
    if (!isRecord(citation)) return []

    return [{
      id: typeof citation.id === 'string' ? citation.id : undefined,
      uploadId: typeof citation.uploadId === 'string' ? citation.uploadId : undefined,
      filename: typeof citation.filename === 'string' ? citation.filename : undefined,
      sourceFilename: typeof citation.sourceFilename === 'string' ? citation.sourceFilename : undefined,
      page: typeof citation.page === 'number' ? citation.page : undefined,
      pageNumber: typeof citation.pageNumber === 'number' ? citation.pageNumber : undefined,
      url: typeof citation.url === 'string' ? citation.url : undefined,
      contentUrl: typeof citation.contentUrl === 'string' ? citation.contentUrl : undefined,
      excerpt: typeof citation.excerpt === 'string' ? citation.excerpt : undefined,
      textPreview: typeof citation.textPreview === 'string' ? citation.textPreview : undefined
    }]
  }).slice(0, 5)
}

function getCitations(message: UIMessage): PortfolioCitation[] {
  const part = message.parts.find(part => part.type === 'data-citations')
  return part && 'data' in part ? normalizeCitations(part.data) : []
}

function citationPage(citation: PortfolioCitation): number | undefined {
  return citation.pageNumber ?? citation.page
}

function citationLabel(citation: PortfolioCitation): string {
  const filename = citation.sourceFilename ?? citation.filename ?? 'Resume'
  const page = citationPage(citation)
  return page ? `${filename} · page ${page}` : filename
}

function citationUrl(citation: PortfolioCitation): string {
  const page = citationPage(citation)
  const candidate = citation.contentUrl
    ?? citation.url
    ?? (citation.uploadId ? `/api/library/files/${encodeURIComponent(citation.uploadId)}/content` : '/library')
  const base = candidate === '/library' || candidate.startsWith('/api/library/files/')
    ? candidate
    : '/library'
  return page && !base.includes('#') ? `${base}#page=${page}` : base
}

function requestMessages(messages: PortfolioMessage[]) {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      id: message.id,
      role: message.role,
      parts: message.parts.flatMap(part => part.type === 'text'
        ? [{ type: 'text' as const, text: part.text }]
        : [])
    }))
    .filter(message => message.parts.length > 0)
    .slice(-8)
}

const rateAwareFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init)
  updateQuotaFromHeaders(response.headers)
  return response
}

const transport = new DefaultChatTransport<PortfolioMessage>({
  api: '/api/chat',
  headers: { [headerName]: csrf },
  fetch: rateAwareFetch,
  prepareSendMessagesRequest({ id, messages, headers }) {
    return {
      headers,
      body: {
        id,
        messages: requestMessages(messages)
      }
    }
  }
})

const { messages, status, error, sendMessage, regenerate, stop } = useChat<PortfolioMessage>({
  id: chatId.value,
  transport,
  onData(dataPart) {
    if (dataPart.type === 'data-citations') {
      pendingCitations.value = normalizeCitations(dataPart.data)
    }
  },
  onFinish({ message, messages: completedMessages }) {
    const citations = pendingCitations.value
    const nextMessages = completedMessages.map((item) => {
      if (item.id !== message.id || citations.length === 0 || getCitations(item).length > 0) return item

      return {
        ...item,
        parts: [
          { type: 'data-citations' as const, data: citations },
          ...item.parts
        ]
      }
    })

    messages.value = nextMessages
    saveMessages(chatId.value, nextMessages)
    pendingCitations.value = []
  },
  onError(chatError) {
    saveMessages(chatId.value, messages.value)
    pendingCitations.value = []

    let description = chatError.message
    if (typeof description === 'string' && description.trim().startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(description)
        if (isRecord(parsed)) {
          if (typeof parsed.message === 'string') {
            description = parsed.message
          } else if (isRecord(parsed.data) && typeof parsed.data.message === 'string') {
            description = parsed.data.message
          } else if (typeof parsed.statusMessage === 'string') {
            description = parsed.statusMessage
          }
        }
      } catch {
        // Keep the response body when it is not valid JSON.
      }
    }

    toast.add({
      title: 'Unable to answer',
      description,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
})

const requestActive = computed(() => status.value === 'submitted' || status.value === 'streaming')
const promptSubmitDisabled = computed(() => {
  if (requestActive.value) return false
  return cachedQuotaExhausted.value || (status.value === 'ready' && !input.value.trim())
})

function showDailyLimitModalOnce() {
  if (!import.meta.client || !pageReady.value || !localChat.value || !cachedQuotaExhausted.value) return

  const quotaWindow = quota.value?.resetAt ?? new Date().toISOString().slice(0, 10)
  if (dailyLimitModalShownWindow.value === quotaWindow) return

  try {
    if (localStorage.getItem(DAILY_LIMIT_MODAL_STORAGE_KEY) === quotaWindow) {
      dailyLimitModalShownWindow.value = quotaWindow
      return
    }
    localStorage.setItem(DAILY_LIMIT_MODAL_STORAGE_KEY, quotaWindow)
  } catch {
    // The in-memory window still prevents repeats during this browser session.
  }

  dailyLimitModalShownWindow.value = quotaWindow
  dailyLimitModalOpen.value = true
}

watch([cachedQuotaExhausted, requestActive], ([quotaExhausted, active]) => {
  if (quotaExhausted && !active) showDailyLimitModalOnce()
})

let persistenceTimer: ReturnType<typeof setTimeout> | undefined

watch(messages, () => {
  if (!pageReady.value || !localChat.value) return
  clearTimeout(persistenceTimer)
  persistenceTimer = setTimeout(() => saveMessages(chatId.value, messages.value), 300)
})

onMounted(async () => {
  hydrate()

  const chat = getChat(chatId.value)
  if (chat) {
    messages.value = chat.messages as PortfolioMessage[]
  }

  pageReady.value = true
  await nextTick()

  if (chat && consumePendingResponse(chat.id) && !cachedQuotaExhausted.value) {
    void regenerate()
  } else {
    showDailyLimitModalOnce()
  }
})

onBeforeUnmount(() => {
  clearTimeout(persistenceTimer)
  if (pageReady.value && localChat.value) {
    saveMessages(chatId.value, messages.value)
  }
})

async function handleSubmit(event: Event) {
  event.preventDefault()
  const question = input.value.trim()
  if (
    !question
    || cachedQuotaExhausted.value
    || status.value === 'streaming'
    || status.value === 'submitted'
  ) return

  input.value = ''
  pendingCitations.value = []
  await sendMessage({ text: question })
}

function startEdit(message: UIMessage) {
  if (editingMessageId.value) return
  editingMessageId.value = message.id
}

async function saveEdit(message: UIMessage, text: string) {
  editingMessageId.value = null
  pendingCitations.value = []
  await sendMessage({ text, messageId: message.id })
}

async function regenerateMessage(message: UIMessage) {
  pendingCitations.value = []
  await regenerate({ messageId: message.id })
}

async function retryLastMessage() {
  pendingCitations.value = []
  await regenerate()
}

function getVote(messageId: string) {
  return votes.value[messageId] ?? null
}

function vote(message: UIMessage, isUpvoted: boolean) {
  const current = votes.value[message.id]
  if (current === isUpvoted) {
    votes.value[message.id] = null
  } else {
    votes.value[message.id] = isUpvoted
  }
}
</script>

<template>
  <UDashboardPanel
    v-if="pageReady && localChat"
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <Navbar>
        <template #title>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ localChat.title }}
            </p>
            <p class="hidden text-xs text-muted sm:block">
              Saved only in this browser
            </p>
          </div>
        </template>
      </Navbar>
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
        <UAlert
          v-if="storageError"
          color="warning"
          variant="soft"
          icon="i-lucide-hard-drive"
          :description="storageError"
          class="mt-20"
        />

        <UChatMessages
          should-auto-scroll
          :messages="messages"
          :status="status"
          :spacing-offset="200"
          class="pt-(--ui-header-height) pb-4 sm:pb-6"
        >
          <template #indicator>
            <div class="flex items-center gap-1.5">
              <ChatIndicator />
              <UChatShimmer text="Sussing Leonardo's digital footprint..." class="text-sm" />
            </div>
          </template>

          <template #content="{ message }">
            <ChatMessageContent
              :message="message"
              :editing="editingMessageId === message.id"
              @save="saveEdit"
              @cancel-edit="editingMessageId = null"
            />

            <div v-if="getCitations(message).length" class="mt-3 flex flex-wrap gap-2">
              <UButton
                v-for="(citation, index) in getCitations(message)"
                :key="citation.id ?? `${message.id}-${index}`"
                :to="citationUrl(citation)"
                target="_blank"
                :label="citationLabel(citation)"
                icon="i-lucide-file-search"
                trailing-icon="i-lucide-arrow-up-right"
                color="neutral"
                variant="outline"
                size="xs"
                class="rounded-full"
              />
            </div>
          </template>

          <template #actions="{ message }">
            <ChatMessageActions
              :message="message"
              :streaming="status === 'streaming' && message.id === messages[messages.length - 1]?.id"
              :editing="editingMessageId === message.id"
              :vote="getVote(message.id)"
              @vote="(_message, isUpvoted) => vote(_message, isUpvoted)"
              @edit="startEdit"
              @regenerate="regenerateMessage"
            />
          </template>
        </UChatMessages>

        <div class="sticky bottom-0 z-10 flex flex-col gap-2">
          <p
            v-if="cachedQuotaExhausted"
            class="self-center rounded-full bg-elevated px-3 py-1.5 text-xs font-medium text-muted ring ring-default"
          >
            Ask again tommorow :)
          </p>

          <UChatPrompt
            v-model="input"
            :error="error"
            :maxlength="1000"
            placeholder="Ask a follow-up about Leonardo..."
            color="neutral"
            variant="subtle"
            class="[view-transition-name:chat-prompt] rounded-b-none"
            :ui="{ base: 'px-1.5' }"
            @submit="handleSubmit"
          >
            <template #footer>
              <span />

              <UChatPromptSubmit
                :status="status"
                :disabled="promptSubmitDisabled"
                color="neutral"
                size="sm"
                @stop="stop()"
                @reload="retryLastMessage"
              />
            </template>
          </UChatPrompt>
        </div>
      </UContainer>

      <ChatDailyQuestionLimitModal v-model:open="dailyLimitModalOpen" />
    </template>
  </UDashboardPanel>

  <UDashboardPanel v-else-if="!pageReady || !hydrated" id="chat-loading" class="min-h-0">
    <template #header>
      <Navbar />
    </template>
    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center gap-4">
        <USkeleton class="h-6 w-48" />
        <USkeleton class="h-24 w-full" />
      </UContainer>
    </template>
  </UDashboardPanel>

  <UContainer v-else class="flex-1 flex flex-col gap-4 sm:gap-6">
    <UError
      :error="{ statusMessage: 'This chat is not stored in this browser', statusCode: 404 }"
      class="min-h-full"
    />
  </UContainer>
</template>
