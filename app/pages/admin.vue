<script setup lang="ts">
import type { TableColumn, TableRow, TabsItem } from '@nuxt/ui'
import { useIntervalFn } from '@vueuse/core'
import { LazyAdminUploadProgressModal, LazyModalConfirm } from '#components'

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

type StoredResume = {
  originalName: string
  sizeBytes: number
  checksumSha256: string | null
  etag: string
  uploadedAt: string
  downloadUrl: string
}

type ResumeResponse = {
  resume: StoredResume | null
  fallbackUrl?: string
}

const MAX_PDF_BYTES = 10 * 1024 * 1024

useSeoMeta({
  title: 'Library Administration | Leonardo Prasetyo',
  description: 'Private document ingestion and deletion controls.',
  robots: 'noindex, nofollow'
})

const toast = useToast()
const overlay = useOverlay()
const deleteModal = overlay.create(LazyModalConfirm)
const uploadModal = overlay.create(LazyAdminUploadProgressModal)
const route = useRoute()
const router = useRouter()
const { clear } = useUserSession()
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = shallowRef<File | null>(null)
const resumeInput = ref<HTMLInputElement | null>(null)
const selectedResumeFile = shallowRef<File | null>(null)
const resume = shallowRef<StoredResume | null>(null)
const resumeFallbackUrl = ref('/leonardo-prasetyo-resume.pdf')
const resumeLoading = ref(false)
const resumeUploading = ref(false)
const resumeError = ref<string | null>(null)
const files = ref<AdminFile[]>([])
const filesLoading = ref(false)
const filesError = ref<string | null>(null)
const tasks = ref<AdminIndexingTask[]>([])
const tasksLoading = ref(false)
const tasksError = ref<string | null>(null)
const activeTab = ref(route.query.tab === 'tasks' ? 'tasks' : 'files')
const uploading = ref(false)
const deletingId = ref<string | null>(null)

const {
  data: adminSession,
  status: sessionStatus,
  refresh: refreshAdminSession
} = await useFetch<AdminSession>('/api/admin/session', {
  key: 'library-admin-session',
  headers: { accept: 'application/json' }
})

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
    void Promise.all([loadFiles(), loadResume(), loadTasks()])
  } else if (!authorized) {
    files.value = []
    tasks.value = []
    resume.value = null
  }
}, { immediate: true })

watch(activeTab, (tab) => {
  if (!import.meta.client) return
  void router.replace({
    query: {
      ...route.query,
      tab: tab === 'tasks' ? 'tasks' : undefined
    }
  })
})

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
  activating_document: 'Activating document',
  cleaning_previous: 'Cleaning previous revision',
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

async function loadResume() {
  if (!adminSession.value?.authorized || resumeLoading.value) return
  resumeLoading.value = true
  resumeError.value = null
  try {
    const response = await $fetch<ResumeResponse>('/api/admin/library/resume')
    resume.value = response.resume
    resumeFallbackUrl.value = response.fallbackUrl || '/leonardo-prasetyo-resume.pdf'
  } catch (error) {
    resumeError.value = errorMessage(error, 'Unable to load the current resume.')
  } finally {
    resumeLoading.value = false
  }
}

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

function chooseResumeFile() {
  resumeInput.value?.click()
}

function selectResumeFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  if (!file) return
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast.add({ title: 'PDF required', description: 'Select an application/pdf resume.', color: 'error' })
    input.value = ''
    return
  }
  if (file.size > MAX_PDF_BYTES) {
    toast.add({ title: 'Resume is too large', description: 'The maximum upload size is 10 MiB.', color: 'error' })
    input.value = ''
    return
  }
  selectedResumeFile.value = file
}

async function uploadResume() {
  const file = selectedResumeFile.value
  if (!file || resumeUploading.value) return

  resumeUploading.value = true
  try {
    const response = await $fetch<ResumeResponse>('/api/admin/library/resume', {
      method: 'PUT',
      body: file,
      headers: {
        'content-type': 'application/pdf',
        'x-filename': encodeURIComponent(file.name)
      }
    })
    resume.value = response.resume
    selectedResumeFile.value = null
    if (resumeInput.value) resumeInput.value.value = ''
    toast.add({
      title: 'Resume published',
      description: `${file.name} now opens from the Resume sidebar link.`,
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
  } catch (error) {
    toast.add({
      title: 'Resume upload failed',
      description: errorMessage(error, 'The resume PDF could not be uploaded.'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    await loadResume()
  } finally {
    resumeUploading.value = false
  }
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

async function signOut() {
  await clear()
  files.value = []
  tasks.value = []
  resume.value = null
  await refreshAdminSession()
}
</script>

<template>
  <UDashboardPanel id="admin" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~/admin</span>
        </template>

        <UButton
          v-if="adminSession?.authenticated"
          label="Sign out"
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="signOut"
        />
      </Navbar>
    </template>

    <template #body>
      <div class="min-h-full overflow-y-auto px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-24">
        <div class="mx-auto max-w-6xl space-y-8">
          <div v-if="sessionStatus === 'pending'" class="space-y-4">
            <USkeleton class="h-10 w-72" />
            <USkeleton class="h-52 rounded-xl" />
          </div>

          <UCard v-else-if="!adminSession?.authenticated" class="mx-auto max-w-xl text-center">
            <div class="py-10">
              <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UIcon name="i-simple-icons-github" class="size-7" />
              </div>
              <h1 class="mt-6 text-2xl font-bold text-highlighted">
                Library administration
              </h1>
              <p class="mx-auto mt-3 max-w-md leading-7 text-toned">
                Sign in with the approved GitHub account to upload, index, and delete Library documents.
              </p>
              <UButton
                to="/auth/github"
                external
                label="Sign in with GitHub"
                icon="i-simple-icons-github"
                size="lg"
                class="mt-7"
              />
            </div>
          </UCard>

          <UCard v-else-if="!adminSession.authorized" class="mx-auto max-w-xl">
            <div class="py-8 text-center">
              <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-error/10 text-error">
                <UIcon name="i-lucide-shield-x" class="size-7" />
              </div>
              <h1 class="mt-6 text-2xl font-bold text-highlighted">
                Access denied
              </h1>
              <p class="mt-3 text-toned">
                The GitHub account <strong>@{{ adminSession.user?.username }}</strong> is authenticated but is not an approved administrator.
              </p>
              <UButton
                label="Sign out"
                color="neutral"
                variant="soft"
                class="mt-7"
                @click="signOut"
              />
            </div>
          </UCard>

          <template v-else>
            <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <UBadge
                    color="warning"
                    variant="soft"
                    icon="i-lucide-lock-keyhole"
                    label="PRIVATE ADMIN"
                  />
                  <UBadge
                    color="neutral"
                    variant="soft"
                    label="R2 + D1 + VECTORIZE"
                  />
                </div>
                <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
                  Library administration
                </h1>
                <p class="mt-3 max-w-2xl leading-7 text-toned">
                  Publish the downloadable resume, upload a PDF as a new RAG generation, or permanently delete a document and its stored chunks.
                </p>
              </div>
              <div class="flex items-center gap-3 rounded-xl border border-default bg-default px-3 py-2">
                <UAvatar :src="adminSession.user?.avatar" :alt="adminSession.user?.name" size="sm" />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ adminSession.user?.name || adminSession.user?.username }}
                  </p>
                  <p class="truncate text-xs text-muted">
                    @{{ adminSession.user?.username }}
                  </p>
                </div>
              </div>
            </header>

            <UCard>
              <template #header>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 class="font-semibold text-highlighted">
                      Resume PDF
                    </h2>
                    <p class="mt-1 text-sm text-muted">
                      Replaces the PDF opened from the Resume sidebar link. This does not change the RAG index.
                    </p>
                  </div>
                  <UButton
                    :to="resume?.downloadUrl || resumeFallbackUrl"
                    external
                    label="Download current"
                    icon="i-lucide-download"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                </div>
              </template>

              <UAlert
                v-if="resumeError"
                color="error"
                variant="soft"
                icon="i-lucide-file-warning"
                title="Resume metadata is unavailable"
                :description="resumeError"
                class="mb-4"
              />

              <input
                ref="resumeInput"
                type="file"
                accept="application/pdf,.pdf"
                class="sr-only"
                @change="selectResumeFile"
              >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-4 rounded-xl border border-dashed border-default p-4 text-left transition-colors hover:bg-elevated/50"
                  :disabled="resumeUploading"
                  @click="chooseResumeFile"
                >
                  <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UIcon name="i-lucide-file-user" class="size-5" />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-highlighted">
                      {{ selectedResumeFile?.name || resume?.originalName || 'Choose a resume PDF' }}
                    </span>
                    <span class="mt-1 block text-sm text-muted">
                      <template v-if="selectedResumeFile">
                        {{ formatBytes(selectedResumeFile.size) }} selected
                      </template>
                      <template v-else-if="resume">
                        Current upload · {{ formatBytes(resume.sizeBytes) }} · {{ formatDate(resume.uploadedAt) }}
                      </template>
                      <template v-else>
                        Using the built-in resume until a replacement is uploaded
                      </template>
                    </span>
                  </span>
                </button>
                <UButton
                  label="Upload resume"
                  icon="i-lucide-cloud-upload"
                  size="lg"
                  :disabled="!selectedResumeFile"
                  :loading="resumeUploading"
                  @click="uploadResume"
                />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="font-semibold text-highlighted">
                    Publish RAG document
                  </h2>
                  <p class="mt-1 text-sm text-muted">
                    Maximum 10 MiB. Publishing replaces the currently active document after the new vectors are queryable.
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
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
