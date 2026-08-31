<script setup lang="ts">
interface ChunkDetail {
  id: string
  chunkIndex: number
  pageNumber: number
  textContent: string
  charStart: number | null
  charEnd: number | null
  tokenCount: number | null
  contentHash: string
  embeddingModel: string
  dimensions: number
  indexedAt: string
  sourceFile: {
    id: string
    name: string
    url: string
  }
}

interface ChunkResponse {
  chunk: ChunkDetail
}

const route = useRoute()
const chunkId = computed(() => String(route.params.id))
const endpoint = computed(() => `/api/library/chunks/${encodeURIComponent(chunkId.value)}`)

const {
  data: chunkResponse,
  status,
  error,
  refresh
} = await useFetch<ChunkResponse>(endpoint, {
  key: `public-rag-chunk-${chunkId.value}`
})

const chunk = computed(() => chunkResponse.value?.chunk ?? null)
const sourcePageUrl = computed(() => chunk.value
  ? `${chunk.value.sourceFile.url}#page=${chunk.value.pageNumber}`
  : '')
const errorMessage = computed(() => {
  const data = error.value?.data as { statusMessage?: string, message?: string } | undefined
  return data?.statusMessage || data?.message || error.value?.message || 'Unable to load this RAG chunk.'
})

useSeoMeta({
  title: () => chunk.value
    ? `Chunk ${chunk.value.chunkIndex} | RAG Database | Leonardo Prasetyo`
    : 'RAG Chunk | Leonardo Prasetyo',
  description: () => chunk.value
    ? `Indexed content from page ${chunk.value.pageNumber} of ${chunk.value.sourceFile.name}.`
    : 'Read-only RAG chunk content and source metadata.',
  ogTitle: () => chunk.value
    ? `Chunk ${chunk.value.chunkIndex} | RAG Database`
    : 'RAG Chunk',
  ogDescription: () => chunk.value
    ? `Indexed content from page ${chunk.value.pageNumber} of ${chunk.value.sourceFile.name}.`
    : 'Read-only RAG chunk content and source metadata.'
})

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatCharacterRange(start: number | null, end: number | null): string {
  return start === null || end === null ? '—' : `${start.toLocaleString()}–${end.toLocaleString()}`
}
</script>

<template>
  <UDashboardPanel id="rag-chunk" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">
            ~/rag-database/chunk/{{ chunkId.slice(0, 8) }}
          </span>
        </template>

        <UButton
          to="/rag-database"
          label="All chunks"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </Navbar>
    </template>

    <template #body>
      <div class="min-h-full overflow-y-auto px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-24">
        <div class="mx-auto max-w-4xl space-y-6">
          <div v-if="status === 'pending' && !chunk" class="space-y-4">
            <USkeleton class="h-10 w-64" />
            <USkeleton class="h-12 w-full rounded-xl" />
            <USkeleton class="h-72 w-full rounded-xl" />
          </div>

          <div v-else-if="error" class="space-y-4">
            <UAlert
              color="error"
              variant="soft"
              icon="i-lucide-database-zap"
              title="Chunk unavailable"
              :description="errorMessage"
            />
            <UButton
              label="Try again"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              @click="refresh()"
            />
          </div>

          <template v-else-if="chunk">
            <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <UBadge color="neutral" variant="soft" :label="`Page ${chunk.pageNumber}`" />
                  <UBadge color="primary" variant="soft" :label="`Chunk ${chunk.chunkIndex}`" />
                </div>
                <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
                  Chunk {{ chunk.chunkIndex }}
                </h1>
                <p class="mt-2 text-sm text-muted">
                  From <span class="font-medium text-highlighted">{{ chunk.sourceFile.name }}</span>
                </p>
              </div>

              <UButton
                :to="sourcePageUrl"
                target="_blank"
                label="Open source PDF"
                icon="i-lucide-external-link"
                color="neutral"
                variant="outline"
                class="shrink-0"
              />
            </header>

            <UCard>
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  Chunk content
                </h2>
              </template>

              <p class="whitespace-pre-wrap break-words leading-7 text-toned">
                {{ chunk.textContent }}
              </p>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  Details
                </h2>
              </template>

              <dl class="grid gap-5 text-sm sm:grid-cols-2">
                <div>
                  <dt class="text-muted">
                    Source file
                  </dt>
                  <dd class="mt-1">
                    <a
                      :href="sourcePageUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-primary hover:underline"
                    >
                      {{ chunk.sourceFile.name }}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Page
                  </dt>
                  <dd class="mt-1 font-medium text-highlighted">
                    {{ chunk.pageNumber }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Embedding model
                  </dt>
                  <dd class="mt-1 break-all font-mono text-xs text-highlighted">
                    {{ chunk.embeddingModel }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Dimensions
                  </dt>
                  <dd class="mt-1 font-medium text-highlighted">
                    {{ chunk.dimensions.toLocaleString() }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Tokens
                  </dt>
                  <dd class="mt-1 font-medium text-highlighted">
                    {{ chunk.tokenCount?.toLocaleString() ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Character range
                  </dt>
                  <dd class="mt-1 font-medium text-highlighted">
                    {{ formatCharacterRange(chunk.charStart, chunk.charEnd) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Indexed
                  </dt>
                  <dd class="mt-1 font-medium text-highlighted">
                    {{ formatDate(chunk.indexedAt) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Content hash
                  </dt>
                  <dd class="mt-1 truncate font-mono text-xs text-highlighted" :title="chunk.contentHash">
                    {{ chunk.contentHash }}
                  </dd>
                </div>
              </dl>
            </UCard>
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
