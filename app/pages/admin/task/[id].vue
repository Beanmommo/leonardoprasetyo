<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'

type AdminUser = {
  id: string
  name: string
  email: string
  avatar: string
  username: string
  role: 'user' | 'admin'
}

type AdminSession = {
  authenticated: boolean
  authorized: boolean
  user: AdminUser | null
}

type TaskStage = 'queued' | 'reading_pdf' | 'extracting_text' | 'chunking_text' | 'generating_embeddings' | 'saving_chunks' | 'publishing_vectors' | 'verifying_vectors' | 'activating_document' | 'cleaning_previous' | 'complete' | 'failed'

type AdminIndexingTask = {
  id: string
  uploadId: string
  originalName: string
  workflowInstanceId: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  stage: TaskStage
  progressCurrent: number
  progressTotal: number | null
  pageCount: number | null
  chunkCount: number | null
  embeddingModel: string | null
  embeddingDimensions: number | null
  extractionMethod: 'pdf-parse' | 'cloudflare-markdown' | 'existing' | null
  attempt: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  contentUrl: string
}

type TaskResponse = { task: AdminIndexingTask }

const route = useRoute()
const task = shallowRef<AdminIndexingTask | null>(null)
const taskLoading = ref(false)
const taskError = ref<string | null>(null)

useSeoMeta({
  title: 'Indexing Task | Leonardo Prasetyo',
  description: 'Private Library indexing task progress.',
  robots: 'noindex, nofollow'
})

const {
  data: adminSession,
  status: sessionStatus
} = await useFetch<AdminSession>('/api/admin/session', {
  key: 'library-admin-session',
  headers: { accept: 'application/json' }
})

const stageSteps: Array<{ stage: Exclude<TaskStage, 'failed'>, label: string, description: string }> = [
  { stage: 'queued', label: 'Queued', description: 'Waiting for the indexing Workflow to start.' },
  { stage: 'reading_pdf', label: 'Reading PDF from R2', description: 'Loading and validating the stored PDF.' },
  { stage: 'extracting_text', label: 'Extracting text', description: 'Reading page text from the PDF.' },
  { stage: 'chunking_text', label: 'Creating chunks', description: 'Splitting and deduplicating searchable passages.' },
  { stage: 'generating_embeddings', label: 'Generating embeddings', description: 'Creating one 1,024-dimensional vector per chunk.' },
  { stage: 'saving_chunks', label: 'Saving chunk metadata', description: 'Writing chunk text and provenance to D1.' },
  { stage: 'publishing_vectors', label: 'Publishing vectors', description: 'Upserting the new generation into Vectorize.' },
  { stage: 'verifying_vectors', label: 'Verifying vectors', description: 'Waiting until every vector is queryable.' },
  { stage: 'activating_document', label: 'Activating document', description: 'Atomically publishing the new document generation.' },
  { stage: 'cleaning_previous', label: 'Cleaning previous revision', description: 'Removing superseded vectors and objects.' },
  { stage: 'complete', label: 'Ready', description: 'The document is published and searchable.' }
]

const currentStageIndex = computed(() => {
  const index = stageSteps.findIndex(step => step.stage === task.value?.stage)
  return index < 0 ? 0 : index
})

const isActive = computed(() => task.value?.status === 'queued' || task.value?.status === 'processing')
const progressLabel = computed(() => {
  if (!task.value) return ''
  if (task.value.status === 'ready') {
    return `${task.value.chunkCount || 0} searchable chunk${task.value.chunkCount === 1 ? '' : 's'}`
  }
  if (task.value.progressTotal === null) return stageSteps[currentStageIndex.value]?.label || 'Processing'
  return `${task.value.progressCurrent} of ${task.value.progressTotal}`
})

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data as { statusMessage?: string, message?: string } | undefined
    return data?.statusMessage || data?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

async function loadTask(silent = false) {
  if (!adminSession.value?.authorized || taskLoading.value) return
  taskLoading.value = true
  if (!silent) taskError.value = null
  try {
    const response = await $fetch<TaskResponse>(`/api/admin/library/tasks/${String(route.params.id)}`)
    task.value = response.task
    taskError.value = null
  } catch (error) {
    if (!silent) taskError.value = errorMessage(error, 'Unable to load this indexing task.')
  } finally {
    taskLoading.value = false
  }
}

function openPdf() {
  if (task.value) window.open(task.value.contentUrl, '_blank', 'noopener,noreferrer')
}

const { pause, resume } = useIntervalFn(() => loadTask(true), 2000, { immediate: false })

watch(() => adminSession.value?.authorized, (authorized) => {
  if (import.meta.client && authorized) void loadTask()
}, { immediate: true })

watch(isActive, (active) => {
  if (import.meta.client && active) resume()
  else pause()
}, { immediate: true })

onBeforeUnmount(pause)
</script>

<template>
  <UDashboardPanel id="admin-task" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~/admin/task/{{ String(route.params.id).slice(0, 8) }}</span>
        </template>
        <UButton
          to="/admin?tab=tasks"
          label="All tasks"
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
          <div v-if="sessionStatus === 'pending' || taskLoading && !task" class="space-y-4">
            <USkeleton class="h-10 w-80" />
            <USkeleton class="h-72 rounded-xl" />
          </div>

          <UCard v-else-if="!adminSession?.authorized" class="mx-auto max-w-xl text-center">
            <div class="py-8">
              <UIcon name="i-lucide-shield-x" class="mx-auto size-10 text-error" />
              <h1 class="mt-5 text-2xl font-bold text-highlighted">
                Administrator access required
              </h1>
              <UButton to="/admin" label="Go to admin sign in" class="mt-6" />
            </div>
          </UCard>

          <UAlert
            v-else-if="taskError"
            color="error"
            variant="soft"
            icon="i-lucide-list-x"
            title="Indexing task unavailable"
            :description="taskError"
          />

          <template v-else-if="task">
            <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <UBadge
                    :color="task.status === 'ready' ? 'success' : task.status === 'failed' ? 'error' : task.status === 'processing' ? 'primary' : 'warning'"
                    variant="soft"
                    :label="task.status.toUpperCase()"
                  />
                  <UBadge color="neutral" variant="soft" :label="`Attempt ${task.attempt}`" />
                </div>
                <h1 class="truncate text-3xl font-bold tracking-tight text-highlighted">
                  {{ task.originalName }}
                </h1>
                <p class="mt-2 font-mono text-xs text-muted">
                  {{ task.id }}
                </p>
              </div>
              <UButton
                label="Open PDF"
                icon="i-lucide-external-link"
                color="neutral"
                variant="outline"
                @click="openPdf"
              />
            </header>

            <UAlert
              v-if="task.status === 'failed'"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              title="Indexing failed"
              :description="task.errorMessage || 'The Workflow could not complete this task.'"
            />

            <UCard>
              <template #header>
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <h2 class="font-semibold text-highlighted">
                      Indexing progress
                    </h2>
                    <p class="mt-1 text-sm text-muted">
                      {{ progressLabel }}
                    </p>
                  </div>
                  <UIcon v-if="isActive" name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
                </div>
              </template>

              <UProgress
                v-if="task.progressTotal && isActive"
                :model-value="task.progressCurrent"
                :max="task.progressTotal"
                class="mb-6"
              />
              <UProgress v-else-if="isActive" :model-value="null" class="mb-6" />

              <ol class="space-y-1">
                <li
                  v-for="(step, index) in stageSteps"
                  :key="step.stage"
                  class="flex gap-4 rounded-xl px-3 py-3"
                  :class="index === currentStageIndex && isActive ? 'bg-primary/5' : ''"
                >
                  <span
                    class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border"
                    :class="task.status === 'ready' || index < currentStageIndex ? 'border-success/30 bg-success/10 text-success' : task.status === 'failed' && index === currentStageIndex ? 'border-error/30 bg-error/10 text-error' : index === currentStageIndex ? 'border-primary/30 bg-primary/10 text-primary' : 'border-default text-muted'"
                  >
                    <UIcon
                      :name="task.status === 'ready' || index < currentStageIndex ? 'i-lucide-check' : task.status === 'failed' && index === currentStageIndex ? 'i-lucide-x' : index === currentStageIndex ? 'i-lucide-loader-circle' : 'i-lucide-circle'"
                      class="size-4"
                      :class="{ 'animate-spin': index === currentStageIndex && isActive }"
                    />
                  </span>
                  <div>
                    <p class="text-sm font-medium text-highlighted">
                      {{ step.label }}
                    </p>
                    <p class="mt-1 text-sm text-muted">
                      {{ step.description }}
                    </p>
                  </div>
                </li>
              </ol>
            </UCard>

            <UCard>
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  Task details
                </h2>
              </template>
              <dl class="grid gap-5 text-sm sm:grid-cols-2">
                <div>
                  <dt class="text-muted">
                    Pages
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ task.pageCount ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Chunks
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ task.chunkCount ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Embedding model
                  </dt><dd class="mt-1 break-all font-mono text-xs text-highlighted">
                    {{ task.embeddingModel || '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Dimensions
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ task.embeddingDimensions ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Extraction
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ task.extractionMethod || '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Started
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ formatDate(task.startedAt) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Completed
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ formatDate(task.completedAt) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Last update
                  </dt><dd class="mt-1 font-medium text-highlighted">
                    {{ formatDate(task.updatedAt) }}
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
