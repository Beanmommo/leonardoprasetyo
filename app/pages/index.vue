<script setup lang="ts">
import { useNow } from '@vueuse/core'

const input = ref('')
const loading = ref(false)
const greeting = 'Ask about Leonardo\'s experience.'
const now = useNow({ interval: 60_000 })

const { createChat: createLocalChat, hydrate, quota, storageError } = useLocalChats()

const cachedQuotaExhausted = computed(() => {
  if (!quota.value || quota.value.remaining > 0) return false
  return !quota.value.resetAt || Date.parse(quota.value.resetAt) > now.value.getTime()
})

onMounted(hydrate)

async function createChat(prompt: string) {
  const question = prompt.trim()
  if (!question || loading.value) return

  loading.value = true

  try {
    const chat = createLocalChat(question)
    await navigateTo(`/chat/${chat.id}`)
  } finally {
    loading.value = false
  }
}

async function onSubmit() {
  await createChat(input.value)
}

const quickChats = [
  {
    label: 'What is Leonardo working on now?',
    logo: true
  },
  {
    label: 'What is his full-stack experience?',
    icon: 'i-lucide-panels-top-left'
  },
  {
    label: 'How has he applied AI and RAG?',
    icon: 'i-lucide-sparkles'
  },
  {
    label: 'Which cloud platforms has he used?',
    icon: 'i-lucide-cloud'
  },
  {
    label: 'Summarise his energy industry experience',
    icon: 'i-lucide-zap'
  }
]
</script>

<template>
  <UDashboardPanel
    id="home"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar />
    </template>

    <template #body>
      <div class="flex flex-1">
        <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8">
          <div>
            <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
              {{ greeting }}
            </h1>
          </div>

          <UAlert
            v-if="storageError"
            color="warning"
            variant="soft"
            icon="i-lucide-hard-drive"
            :description="storageError"
          />

          <UChatPrompt
            v-model="input"
            :status="loading ? 'streaming' : 'ready'"
            :disabled="loading"
            :maxlength="1000"
            placeholder="Ask about Leonardo's work, skills or experience..."
            class="[view-transition-name:chat-prompt]"
            color="neutral"
            variant="subtle"
            :ui="{ base: 'px-1.5' }"
            @submit="onSubmit"
          >
            <template #footer>
              <UChatPromptSubmit
                color="neutral"
                size="sm"
                :disabled="!input.trim() || loading"
              />
            </template>
          </UChatPrompt>

          <p v-if="cachedQuotaExhausted" class="text-sm text-warning">
            The last checked network had no questions remaining. Submit again to recheck if your public IP changed.
          </p>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="quickChat in quickChats"
              :key="quickChat.label"
              :icon="quickChat.icon"
              :label="quickChat.label"
              size="sm"
              color="neutral"
              variant="outline"
              class="rounded-full"
              :disabled="loading"
              @click="createChat(quickChat.label)"
            >
              <template v-if="quickChat.logo" #leading>
                <Logo class="size-4 shrink-0 text-primary" />
              </template>
            </UButton>
          </div>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
