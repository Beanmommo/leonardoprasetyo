<script setup lang="ts">
import type { TableColumn, TableRow, TabsItem } from '@nuxt/ui'
import { useIntervalFn } from '@vueuse/core'
import { LazyAdminUploadProgressModal, LazyModalConfirm } from '#components'

type AdminFile = {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  checksumSha256: string
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  pageCount: number | null
  chunkCount: number
  indexedAt: string | null
  createdAt: string
  updatedAt: string
  contentUrl: string
  r2: {
    key: string
    sizeBytes: number
    etag: string
    uploadedAt: string
  } | null
}

type AdminFilesResponse = {
  files: AdminFile[]
}

type UploadResponse = {
  file: Pick<AdminFile, 'id' | 'originalName' | 'checksumSha256' | 'status' | 'sizeBytes'>
  alreadyExisted: boolean
}

type AdminIndexingTask = {
  id: string
  uploadId: string
  originalName: string
  workflowInstanceId: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  stage: 'queued' | 'reading_pdf' | 'extracting_text' | 'chunking_text' | 'generating_embeddings' | 'saving_chunks' | 'publishing_vectors' | 'verifying_vectors' | 'activating_document' | 'cleaning_previous' | 'complete' | 'failed'
  progressCurrent: number
  progressTotal: number | null
  pageCount: number | null
  chunkCount: number | null
  attempt: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  contentUrl: string
}

type IngestionResponse = {
  task: AdminIndexingTask
}

type AdminTasksResponse = {
  tasks: AdminIndexingTask[]
}

const MAX_PDF_BYTES = 10 * 1024 * 1024

useSeoMeta({
  title: 'RAG Documents | Leonardo Prasetyo',
  description: 'Private document ingestion, indexing, and deletion controls.',
  robots: 'noindex, nofollow'
})

const toast = useToast()
const overlay = useOverlay()
const deleteModal = overlay.create(LazyModalConfirm)
const uploadModal = overlay.create(LazyAdminUploadProgressModal)
const route = useRoute()
const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = shallowRef<File | null>(null)
const files = ref<AdminFile[]>([])
const filesLoading = ref(false)
const filesError = ref<string | null>(null)
const tasks = ref<AdminIndexingTask[]>([])
const tasksLoading = ref(false)
const tasksError = ref<string | null>(null)
const activeTab = computed({
  get: () => route.query.tab === 'tasks' ? 'tasks' : 'files',
  set: (tab: string | number) => {
    void router.replace({
      query: {
        ...route.query,
        tab: tab === 'tasks' ? 'tasks' : undefined
      }
    })
  }
})
const uploading = ref(false)
const deletingId = ref<string | null>(null)

const {
  data: adminSession,
  status: sessionStatus,
  error: sessionError,
  refresh: refreshAdminSession
} = await useAdminSession()

const columns: TableColumn<AdminFile>[] = [
  { accessorKey: 'originalName', header: 'File' },
  {
    id: 'size',
    accessorFn: file => formatBytes(file.r2?.sizeBytes ?? file.sizeBytes),
    header: 'Size'
  },
  { accessorKey: 'pageCount', header: 'Pages' },
  { accessorKey: 'chunkCount', header: 'Chunks' },
  { accessorKey: 'status', header: 'Status' },
  {
    id: 'updated',
    accessorFn: file => formatDate(file.updatedAt),
    header: 'Updated'
  },
  { id: 'actions', header: '' }
]

const taskColumns: TableColumn<AdminIndexingTask>[] = [
  { accessorKey: 'originalName', header: 'File' },
  { accessorKey: 'stage', header: 'Stage' },
  { id: 'progress', header: 'Progress' },
  { accessorKey: 'status', header: 'Status' },
  {
    id: 'updated',
    accessorFn: task => formatDate(task.updatedAt),
    header: 'Updated'
  }
]

const activeTaskCount = computed(() => tasks.value.filter(task => task.status === 'queued' || task.status === 'processing').length)
const tabs = computed<TabsItem[]>(() => [
  { label: 'Files', icon: 'i-lucide-files', value: 'files', badge: files.value.length },
  {
    label: 'Tasks',
    icon: 'i-lucide-list-checks',
    value: 'tasks',
    badge: activeTaskCount.value || tasks.value.length
  }
])

watch(() => adminSession.value?.authorized, (authorized) => {
  if (import.meta.client && authorized) {
    void Promise.all([loadFiles(), loadTasks()])
  } else if (!authorized) {
    files.value = []
    tasks.value = []
  }
}, { immediate: true })

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const taskStageLabels: Record<AdminIndexingTask['stage'], string> = {
  queued: 'Queued',
  reading_pdf: 'Reading PDF from R2',
  extracting_text: 'Extracting text',
  chunking_text: 'Creating chunks',
  generating_embeddings: 'Generating embeddings',
  saving_chunks: 'Saving chunk metadata',
  publishing_vectors: 'Publishing vectors',
  verifying_vectors: 'Verifying vectors',
  activating_document: 'Publishing source',
  cleaning_previous: 'Finalizing source',
  complete: 'Complete',
  failed: 'Failed'
}

function taskProgressLabel(task: AdminIndexingTask): string {
  if (task.status === 'ready') {
    return `${task.chunkCount || 0} chunk${task.chunkCount === 1 ? '' : 's'}`
  }
  if (task.progressTotal === null) return '—'
  return `${task.progressCurrent}/${task.progressTotal}`
}

function openFileInNewTab(file: AdminFile | AdminIndexingTask) {
  window.open(file.contentUrl, '_blank', 'noopener,noreferrer')
}

function selectFileRow(_event: Event, row: TableRow<AdminFile>) {
  openFileInNewTab(row.original)
}

function selectTaskRow(_event: Event, row: TableRow<AdminIndexingTask>) {
  void navigateTo(`/admin/task/${row.original.id}`)
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data as { statusMessage?: string, message?: string } | undefined
    return data?.statusMessage || data?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

async function loadFiles() {
  if (!adminSession.value?.authorized || filesLoading.value) return
  filesLoading.value = true
  filesError.value = null
  try {
    const response = await $fetch<AdminFilesResponse>('/api/admin/library/files')
    files.value = response.files
  } catch (error) {
    filesError.value = errorMessage(error, 'Unable to load administrator files.')
  } finally {
    filesLoading.value = false
  }
}

async function loadTasks(silent = false) {
  if (!adminSession.value?.authorized || tasksLoading.value) return
  tasksLoading.value = true
  if (!silent) tasksError.value = null
  try {
    const response = await $fetch<AdminTasksResponse>('/api/admin/library/tasks')
    tasks.value = response.tasks
    tasksError.value = null
  } catch (error) {
    if (!silent) {
      tasksError.value = errorMessage(error, 'Unable to load indexing tasks.')
    }
  } finally {
    tasksLoading.value = false
  }
}

const { pause: pauseTaskPolling, resume: resumeTaskPolling } = useIntervalFn(
  () => loadTasks(true),
  2500,
  { immediate: false }
)

watch([activeTab, () => adminSession.value?.authorized], ([tab, authorized]) => {
  if (import.meta.client && tab === 'tasks' && authorized) {
    void loadTasks(true)
    resumeTaskPolling()
  } else {
    pauseTaskPolling()
  }
}, { immediate: true })

onBeforeUnmount(pauseTaskPolling)

function chooseFile() {
  fileInput.value?.click()
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  if (!file) return
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast.add({ title: 'PDF required', description: 'Select an application/pdf document.', color: 'error' })
    input.value = ''
    return
  }
  if (file.size > MAX_PDF_BYTES) {
    toast.add({ title: 'PDF is too large', description: 'The maximum upload size is 10 MiB.', color: 'error' })
    input.value = ''
    return
  }
  selectedFile.value = file
}

async function uploadAndIndex() {
  const file = selectedFile.value
  if (!file || uploading.value) return

  uploading.value = true
  const modal = uploadModal.open({
    filename: file.name,
    state: 'uploading'
  })
  try {
    const upload = await $fetch<UploadResponse>('/api/admin/library/files', {
      method: 'PUT',
      body: file,
      headers: {
        'content-type': 'application/pdf',
        'x-filename': encodeURIComponent(file.name)
      }
    })

    const ingestion = await $fetch<IngestionResponse>('/api/admin/library/ingest', {
      method: 'POST',
      body: { uploadId: upload.file.id }
    })

    uploadModal.patch({
      state: 'complete',
      taskId: ingestion.task.id
    })
    toast.add({
      title: 'Document queued for indexing',
      description: `${file.name} is safely stored in R2. Indexing will continue in the background.`,
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    await Promise.all([loadFiles(), loadTasks()])

    const action = await modal.result
    if (action === 'view') {
      await navigateTo(`/admin/task/${ingestion.task.id}`)
    }
  } catch (error) {
    uploadModal.patch({
      state: 'error',
      errorMessage: errorMessage(error, 'The PDF could not be uploaded and queued for indexing.')
    })
    toast.add({
      title: 'Document upload failed',
      description: errorMessage(error, 'The PDF could not be uploaded and queued for indexing.'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    await Promise.all([loadFiles(), loadTasks()])
    await modal.result
  } finally {
    uploading.value = false
  }
}

async function deleteFile(file: AdminFile) {
  const instance = deleteModal.open({
    title: `Delete ${file.originalName}?`,
    description: `This permanently removes the R2 object, its D1 chunk records, and ${file.chunkCount} Vectorize chunk${file.chunkCount === 1 ? '' : 's'}.`,
    color: 'error'
  })
  if (!await instance.result) return

  deletingId.value = file.id
  try {
    const response = await $fetch<{
      deletion: { deletedVectorCount: number, alreadyDeleted: boolean }
    }>(`/api/admin/library/files/${file.id}`, { method: 'DELETE' })
    toast.add({
      title: response.deletion.alreadyDeleted ? 'Document was already deleted' : 'Document deleted',
      description: `${response.deletion.deletedVectorCount} Vectorize chunk${response.deletion.deletedVectorCount === 1 ? '' : 's'} removed.`,
      color: 'success',
      icon: 'i-lucide-trash-2'
    })
    await loadFiles()
  } catch (error) {
    toast.add({
      title: 'Document deletion failed',
      description: errorMessage(error, 'The document could not be deleted.'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <AdminPage
    id="admin-files"
    :session="adminSession"
    :pending="sessionStatus === 'pending'"
    :error="Boolean(sessionError)"
    @retry="refreshAdminSession"
  >
    <header>
      <UBadge
        color="warning"
        variant="soft"
        icon="i-lucide-lock-keyhole"
        label="PRIVATE ADMIN"
      />
      <h1 class="mt-4 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
        RAG documents
      </h1>
      <p class="mt-3 max-w-2xl leading-7 text-toned">
        Upload PDF sources, manage published files, and follow their indexing tasks.
      </p>
    </header>

    <UCard>
      <template #header>
        <div>
          <h2 class="font-semibold text-highlighted">
            Publish RAG document
          </h2>
          <p class="mt-1 text-sm text-muted">
            Maximum 10 MiB. Each published PDF becomes an additional document source for RAG.
          </p>
        </div>
      </template>

      <input
        ref="fileInput"
        type="file"
        accept="application/pdf,.pdf"
        class="sr-only"
        @change="selectFile"
      >
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-dashed border-default p-4 text-left transition-colors hover:bg-elevated/50"
          :disabled="uploading"
          @click="chooseFile"
        >
          <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error">
            <UIcon name="i-lucide-file-up" class="size-5" />
          </span>
          <span class="min-w-0">
            <span class="block truncate font-medium text-highlighted">
              {{ selectedFile?.name || 'Choose a PDF document' }}
            </span>
            <span class="mt-1 block text-sm text-muted">
              {{ selectedFile ? formatBytes(selectedFile.size) : 'Click to browse' }}
            </span>
          </span>
        </button>
        <UButton
          label="Upload and index"
          icon="i-lucide-cloud-upload"
          size="lg"
          :disabled="!selectedFile"
          :loading="uploading"
          @click="uploadAndIndex"
        />
      </div>
    </UCard>

    <section>
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UTabs
          v-model="activeTab"
          :items="tabs"
          :content="false"
          variant="link"
          class="w-full sm:w-auto"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :aria-label="activeTab === 'files' ? 'Refresh documents' : 'Refresh indexing tasks'"
          :loading="activeTab === 'files' ? filesLoading : tasksLoading"
          @click="activeTab === 'files' ? loadFiles() : loadTasks()"
        />
      </div>

      <template v-if="activeTab === 'files'">
        <UAlert
          v-if="filesError"
          color="error"
          variant="soft"
          icon="i-lucide-database-zap"
          title="Administrator files are unavailable"
          :description="filesError"
          class="mb-4"
        />

        <div v-if="filesLoading && !files.length" class="overflow-hidden rounded-xl border border-default">
          <USkeleton class="h-12 rounded-none" />
          <USkeleton class="mt-px h-16 rounded-none" />
        </div>

        <UCard v-else-if="!files.length" class="text-center">
          <div class="py-8">
            <UIcon name="i-lucide-package-open" class="mx-auto size-9 text-muted" />
            <p class="mt-4 font-medium text-highlighted">
              No documents uploaded
            </p>
          </div>
        </UCard>

        <UTable
          v-else
          :data="files"
          :columns="columns"
          class="rounded-xl border border-default bg-default"
          :ui="{ tr: 'data-[selectable=true]:cursor-pointer' }"
          @select="selectFileRow"
        >
          <template #originalName-cell="{ row }">
            <div class="flex min-w-0 items-center gap-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-error/10 text-error">
                <UIcon name="i-lucide-file-type-2" class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="max-w-64 truncate font-medium text-highlighted">
                  {{ row.original.originalName }}
                </p>
                <p class="max-w-64 truncate font-mono text-xs text-muted">
                  {{ row.original.r2?.key || row.original.checksumSha256 }}
                </p>
              </div>
            </div>
          </template>

          <template #pageCount-cell="{ row }">
            {{ row.original.pageCount ?? '—' }}
          </template>

          <template #status-cell="{ row }">
            <UBadge
              :color="row.original.status === 'ready' ? 'success' : row.original.status === 'failed' ? 'error' : 'warning'"
              variant="soft"
              :label="row.original.status.toUpperCase()"
            />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                label="Delete"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :loading="deletingId === row.original.id"
                :disabled="Boolean(deletingId) || uploading"
                @click.stop="deleteFile(row.original)"
              />
            </div>
          </template>
        </UTable>
      </template>

      <template v-else>
        <UAlert
          v-if="tasksError"
          color="error"
          variant="soft"
          icon="i-lucide-list-x"
          title="Indexing tasks are unavailable"
          :description="tasksError"
          class="mb-4"
        />

        <div v-if="tasksLoading && !tasks.length" class="overflow-hidden rounded-xl border border-default">
          <USkeleton class="h-12 rounded-none" />
          <USkeleton class="mt-px h-16 rounded-none" />
        </div>

        <UCard v-else-if="!tasks.length" class="text-center">
          <div class="py-8">
            <UIcon name="i-lucide-list-checks" class="mx-auto size-9 text-muted" />
            <p class="mt-4 font-medium text-highlighted">
              No indexing tasks yet
            </p>
            <p class="mt-2 text-sm text-muted">
              New and past indexing runs will appear here.
            </p>
          </div>
        </UCard>

        <UTable
          v-else
          :data="tasks"
          :columns="taskColumns"
          class="rounded-xl border border-default bg-default"
          :ui="{ tr: 'data-[selectable=true]:cursor-pointer' }"
          @select="selectTaskRow"
        >
          <template #originalName-cell="{ row }">
            <div class="flex min-w-0 items-center gap-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-file-clock" class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="max-w-64 truncate font-medium text-highlighted">
                  {{ row.original.originalName }}
                </p>
                <p class="font-mono text-xs text-muted">
                  {{ row.original.id.slice(0, 8) }}
                </p>
              </div>
            </div>
          </template>

          <template #stage-cell="{ row }">
            <span class="text-sm text-toned">{{ taskStageLabels[row.original.stage] }}</span>
          </template>

          <template #progress-cell="{ row }">
            <div class="min-w-24">
              <p class="text-sm font-medium text-highlighted">
                {{ taskProgressLabel(row.original) }}
              </p>
              <UProgress
                v-if="row.original.progressTotal && row.original.status === 'processing'"
                :model-value="row.original.progressCurrent"
                :max="row.original.progressTotal"
                size="xs"
                class="mt-1"
              />
            </div>
          </template>

          <template #status-cell="{ row }">
            <UBadge
              :color="row.original.status === 'ready' ? 'success' : row.original.status === 'failed' ? 'error' : row.original.status === 'processing' ? 'primary' : 'warning'"
              variant="soft"
              :label="row.original.status.toUpperCase()"
            />
          </template>
        </UTable>
      </template>
    </section>
  </AdminPage>
</template>
