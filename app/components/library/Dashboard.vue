<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'

const props = defineProps<{
  view: 'all' | 'files' | 'rag-database'
}>()

const route = useRoute()
const RAG_PAGE_SIZE = 10

interface LibraryFile {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  checksumSha256: string
  role: 'resume' | 'document'
  status: string
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

interface LibraryVector {
  vectorId: string
  sourceFilename: string
  sourceFileUrl: string
  pageNumber: number | null
  chunkIndex: number
  textPreview: string
  embeddingModel: string
  dimensions: number
  magnitude: number | null
  valuesPreview: number[]
  projection: {
    x: number
    y: number
  } | null
  indexedAt: string | null
}

interface VectorIndex {
  name: string
  dimensions: number
  metric: string
  vectorCount: number
  processedUpToDatetime: string | null
  processedUpToMutation: number | null
  embeddingModel: string
}

interface FilesResponse {
  files: LibraryFile[]
}

interface VectorsResponse {
  uploadId: string
  items: LibraryVector[]
  nextCursor: string | null
  hasMore: boolean
  page: number
  pageSize: number
  total: number
}

interface IndexResponse {
  index: VectorIndex
}

const pageContent = computed(() => {
  if (props.view === 'files') {
    return {
      routeLabel: '~/files',
      heading: 'Files',
      description: '',
      technology: 'R2 OBJECT STORAGE'
    }
  }

  if (props.view === 'rag-database') {
    return {
      routeLabel: '~/rag-database',
      heading: 'RAG Database',
      description: '',
      technology: 'VECTORIZE'
    }
  }

  return {
    routeLabel: '~/library',
    heading: 'Portfolio RAG Library',
    description: 'Inspect the published PDF object, embedding configuration and safe vector previews used to ground chat answers. There are no upload, edit, re-index or delete controls on this page.',
    technology: 'R2 + VECTORIZE'
  }
})

const {
  data: filesResponse,
  status: filesStatus,
  error: filesError,
  refresh: refreshFiles
} = await useFetch<FilesResponse>('/api/library/files', {
  key: `public-library-files-${props.view === 'files' ? 'documents' : 'rag'}`,
  query: {
    role: props.view === 'files' ? 'document' : 'all'
  }
})

const {
  data: indexResponse,
  status: indexStatus,
  error: indexError,
  refresh: refreshIndex
} = await useFetch<IndexResponse>('/api/library/index', {
  key: 'public-library-index'
})

const selectedFileId = ref(props.view === 'rag-database' && typeof route.query.file === 'string' ? route.query.file : '')
const vectors = ref<LibraryVector[]>([])
const nextCursor = ref<string | null>(null)
const hasMoreVectors = ref(false)
const vectorPage = ref(props.view === 'rag-database' ? parsePageQuery(route.query.page) : 1)
const vectorTotal = ref(0)
const vectorsLoading = ref(false)
const vectorsError = ref<string | null>(null)

const files = computed(() => filesResponse.value?.files ?? [])
const selectedFile = computed(() => files.value.find(file => file.id === selectedFileId.value) ?? files.value[0])
const fileFilterItems = computed(() => files.value.map(file => ({
  label: file.originalName,
  value: file.id
})))
const vectorPageStart = computed(() => vectorTotal.value ? (vectorPage.value - 1) * RAG_PAGE_SIZE + 1 : 0)
const vectorPageEnd = computed(() => Math.min(vectorPage.value * RAG_PAGE_SIZE, vectorTotal.value))
const vectorColumns: TableColumn<LibraryVector>[] = [
  { accessorKey: 'chunkIndex', header: 'Chunk' },
  {
    id: 'page',
    accessorFn: vector => vector.pageNumber ?? '—',
    header: 'Page',
    meta: { class: { td: 'whitespace-nowrap text-toned' } }
  },
  {
    accessorKey: 'sourceFilename',
    header: 'File',
    meta: { class: { td: 'max-w-56' } }
  },
  {
    accessorKey: 'textPreview',
    header: 'Content',
    meta: { class: { td: 'max-w-xl truncate text-toned' } }
  },
  {
    id: 'indexedAt',
    accessorFn: vector => formatDate(vector.indexedAt),
    header: 'Indexed',
    meta: { class: { td: 'whitespace-nowrap text-toned' } }
  }
]
const fileColumns: TableColumn<LibraryFile>[] = [
  { accessorKey: 'originalName', header: 'File' },
  ...(props.view === 'files'
    ? []
    : [{ accessorKey: 'role' as const, header: 'Role' }]),
  {
    id: 'objectKey',
    accessorFn: file => file.r2?.key ?? '—',
    header: 'Object key',
    meta: { class: { td: 'max-w-64 truncate font-mono text-xs text-muted' } }
  },
  {
    id: 'size',
    accessorFn: file => formatBytes(file.r2?.sizeBytes ?? file.sizeBytes),
    header: 'Size',
    meta: { class: { td: 'whitespace-nowrap text-toned' } }
  },
  {
    id: 'pages',
    accessorFn: file => file.pageCount ?? '—',
    header: 'Pages',
    meta: { class: { td: 'text-toned' } }
  },
  {
    accessorKey: 'chunkCount',
    header: 'Chunks',
    meta: { class: { td: 'text-toned' } }
  },
  {
    id: 'uploaded',
    accessorFn: file => formatDate(file.r2?.uploadedAt ?? file.updatedAt),
    header: 'Uploaded',
    meta: { class: { td: 'whitespace-nowrap text-toned' } }
  },
  { accessorKey: 'status', header: 'Status' },
  {
    id: 'actions',
    header: 'Action',
    meta: { class: { th: 'text-right', td: 'text-right' } }
  }
]

watch(files, (nextFiles) => {
  if (!nextFiles.length) {
    selectedFileId.value = ''
    return
  }

  if (!nextFiles.some(file => file.id === selectedFileId.value)) {
    selectedFileId.value = nextFiles[0]!.id
    if (props.view === 'rag-database') vectorPage.value = 1
  }
}, { immediate: true })

watch([selectedFileId, vectorPage], ([fileId, page], [previousFileId]) => {
  if (!import.meta.client || !fileId) return

  if (props.view === 'rag-database') {
    if (previousFileId && fileId !== previousFileId && page !== 1) {
      vectorPage.value = 1
      return
    }
    syncRagRoute()
  }

  void loadVectors(true)
})

watch(() => [route.query.file, route.query.page], ([fileQuery, pageQuery]) => {
  if (props.view !== 'rag-database') return

  const routeFileId = typeof fileQuery === 'string' ? fileQuery : ''
  if (routeFileId && files.value.some(file => file.id === routeFileId) && routeFileId !== selectedFileId.value) {
    selectedFileId.value = routeFileId
  }

  const routePage = parsePageQuery(pageQuery)
  if (routePage !== vectorPage.value) vectorPage.value = routePage
})

onMounted(() => {
  if (selectedFileId.value && vectors.value.length === 0) {
    void loadVectors(true)
  }
})

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (value < 1024) return `${value} B`

  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unit = units[0]!

  for (let index = 1; index < units.length && size >= 1024; index++) {
    size /= 1024
    unit = units[index]!
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`
}

function parsePageQuery(value: unknown): number {
  const page = typeof value === 'string' ? Number.parseInt(value, 10) : 1
  return Number.isInteger(page) && page > 0 ? page : 1
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatMagnitude(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—'
}

function previewValues(values: number[]): string {
  if (!values.length) return 'Preview unavailable'
  return `[${values.map(value => Number(value).toFixed(4)).join(', ')}${values.length >= 12 ? ', …' : ''}]`
}

function fileDownloadUrl(file: LibraryFile): string {
  return `${file.contentUrl}?download=1`
}

function selectFile(_event: Event, row: TableRow<LibraryFile>) {
  void navigateTo({
    path: '/rag-database',
    query: { file: row.original.id }
  })
}

function selectVector(_event: Event, row: TableRow<LibraryVector>) {
  void navigateTo(`/rag-database/chunk/${encodeURIComponent(row.original.vectorId)}`)
}

function syncRagRoute() {
  const query: Record<string, string> = { file: selectedFileId.value }
  if (vectorPage.value > 1) query.page = String(vectorPage.value)

  if (route.query.file === query.file && parsePageQuery(route.query.page) === vectorPage.value) return
  void navigateTo({ path: '/rag-database', query }, { replace: true })
}

async function loadVectors(reset = false) {
  if (!selectedFileId.value || vectorsLoading.value) return

  const uploadId = selectedFileId.value
  const requestedPage = vectorPage.value
  const paginated = props.view === 'rag-database'
  vectorsLoading.value = true
  vectorsError.value = null

  try {
    const response = await $fetch<VectorsResponse>('/api/library/vectors', {
      query: {
        uploadId,
        limit: paginated ? RAG_PAGE_SIZE : 20,
        page: paginated ? requestedPage : undefined,
        cursor: paginated || reset ? undefined : nextCursor.value ?? undefined
      }
    })

    if (uploadId !== selectedFileId.value || (paginated && requestedPage !== vectorPage.value)) return
    const lastPage = Math.max(1, Math.ceil(response.total / RAG_PAGE_SIZE))
    if (paginated && requestedPage > lastPage) {
      vectorPage.value = lastPage
      return
    }

    vectors.value = paginated || reset
      ? response.items
      : [...vectors.value, ...response.items.map(item => ({ ...item, projection: null }))]
    nextCursor.value = response.nextCursor
    hasMoreVectors.value = paginated ? false : response.hasMore
    vectorTotal.value = response.total
  } catch (error) {
    vectorsError.value = error instanceof Error ? error.message : 'Unable to load vector records.'
    if (paginated || reset) {
      vectors.value = []
      vectorTotal.value = 0
    }
  } finally {
    vectorsLoading.value = false
    if (selectedFileId.value && (uploadId !== selectedFileId.value || (paginated && requestedPage !== vectorPage.value))) {
      void loadVectors(true)
    }
  }
}

async function refreshLibrary() {
  await Promise.all([refreshFiles(), refreshIndex()])
  await loadVectors(true)
}
</script>

<template>
  <UDashboardPanel
    id="library"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">{{ pageContent.routeLabel }}</span>
        </template>

        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Refresh Library"
          :loading="filesStatus === 'pending' || indexStatus === 'pending' || vectorsLoading"
          @click="refreshLibrary"
        />
      </Navbar>
    </template>

    <template #body>
      <div class="min-h-full overflow-y-auto px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-24">
        <div class="mx-auto max-w-7xl space-y-8">
          <header>
            <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div v-if="props.view === 'all'" class="mb-4 flex flex-wrap items-center gap-2">
                  <UBadge
                    color="success"
                    variant="soft"
                    icon="i-lucide-eye"
                    label="PUBLIC / READ ONLY"
                  />
                  <UBadge color="neutral" variant="soft" :label="pageContent.technology" />
                </div>
                <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
                  {{ pageContent.heading }}
                </h1>
                <p v-if="pageContent.description" class="mt-3 max-w-3xl leading-7 text-toned">
                  {{ pageContent.description }}
                </p>
              </div>

              <UButton
                to="/"
                label="Ask about Leonardo"
                icon="i-lucide-message-circle"
                color="primary"
                variant="soft"
                class="shrink-0"
              />
            </div>
          </header>

          <UAlert
            v-if="filesError"
            color="error"
            variant="soft"
            icon="i-lucide-database-zap"
            title="The document library is unavailable"
            :description="filesError.message"
          />

          <section
            v-if="props.view !== 'rag-database'"
            :aria-labelledby="props.view === 'files' ? undefined : 'r2-objects-heading'"
          >
            <div class="mb-4 flex items-end gap-4" :class="props.view === 'files' ? 'justify-end' : 'justify-between'">
              <div v-if="props.view !== 'files'">
                <p class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  01 / Object storage
                </p>
                <h2 id="r2-objects-heading" class="mt-1 text-2xl font-semibold text-highlighted">
                  Files
                </h2>
              </div>
              <span class="text-sm text-muted">{{ files.length }} published file{{ files.length === 1 ? '' : 's' }}</span>
            </div>

            <div v-if="filesStatus === 'pending' && !files.length" class="overflow-hidden rounded-xl border border-default">
              <USkeleton class="h-12 rounded-none" />
              <USkeleton class="mt-px h-16 rounded-none" />
            </div>

            <UCard v-else-if="!files.length" class="text-center">
              <div class="py-10">
                <UIcon name="i-lucide-package-open" class="mx-auto size-9 text-muted" />
                <h3 class="mt-4 font-semibold text-highlighted">
                  No published document yet
                </h3>
                <p class="mt-2 text-sm text-muted">
                  A PDF will appear after the private R2 upload and ingestion operation completes.
                </p>
              </div>
            </UCard>

            <UTable
              v-else-if="props.view === 'files'"
              :data="files"
              :columns="fileColumns"
              class="rounded-xl border border-default bg-default"
              :ui="{ tr: 'data-[selectable=true]:cursor-pointer' }"
              @select="selectFile"
            >
              <template #originalName-cell="{ row }">
                <div class="flex min-w-0 items-center gap-3">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-error/10 text-error">
                    <UIcon name="i-lucide-file-type-2" class="size-4" />
                  </span>
                  <span class="max-w-64 truncate font-medium text-highlighted">{{ row.original.originalName }}</span>
                </div>
              </template>

              <template #status-cell="{ row }">
                <UBadge
                  :color="row.original.status === 'ready' ? 'success' : 'warning'"
                  variant="soft"
                  :label="row.original.status.toUpperCase()"
                />
              </template>

              <template #actions-cell="{ row }">
                <UButton
                  :to="fileDownloadUrl(row.original)"
                  external
                  label="Download"
                  icon="i-lucide-download"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Download ${row.original.originalName}`"
                  @click.stop
                />
              </template>
            </UTable>

            <div v-else class="grid gap-4 lg:grid-cols-2">
              <button
                v-for="file in files"
                :key="file.id"
                type="button"
                class="rounded-xl border p-5 text-left transition-colors"
                :class="file.id === selectedFile?.id ? 'border-primary bg-primary/5' : 'border-default bg-default hover:bg-elevated/50'"
                @click="selectedFileId = file.id"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-error/10 text-error">
                      <UIcon name="i-lucide-file-type-2" class="size-5" />
                    </div>
                    <div class="min-w-0">
                      <h3 class="truncate font-semibold text-highlighted">
                        {{ file.originalName }}
                      </h3>
                      <p class="mt-1 truncate font-mono text-xs text-muted">
                        {{ file.r2?.key ?? 'Private R2 object' }}
                      </p>
                    </div>
                  </div>
                  <UBadge :color="file.status === 'ready' ? 'success' : 'warning'" variant="soft" :label="file.status.toUpperCase()" />
                </div>

                <dl class="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt class="text-muted">
                      Size
                    </dt>
                    <dd class="mt-1 font-medium text-highlighted">
                      {{ formatBytes(file.r2?.sizeBytes ?? file.sizeBytes) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Pages
                    </dt>
                    <dd class="mt-1 font-medium text-highlighted">
                      {{ file.pageCount ?? '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Chunks
                    </dt>
                    <dd class="mt-1 font-medium text-highlighted">
                      {{ file.chunkCount }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Content type
                    </dt>
                    <dd class="mt-1 truncate font-medium text-highlighted">
                      {{ file.contentType }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      SHA-256
                    </dt>
                    <dd class="mt-1 font-mono text-xs font-medium text-highlighted">
                      {{ file.checksumSha256.slice(0, 12) }}…
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Indexed
                    </dt>
                    <dd class="mt-1 font-medium text-highlighted">
                      {{ formatDate(file.indexedAt) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Uploaded
                    </dt>
                    <dd class="mt-1 font-medium text-highlighted">
                      {{ formatDate(file.r2?.uploadedAt ?? file.updatedAt) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      R2 ETag
                    </dt>
                    <dd class="mt-1 truncate font-mono text-xs font-medium text-highlighted">
                      {{ file.r2?.etag?.slice(0, 14) ?? '—' }}
                    </dd>
                  </div>
                </dl>
              </button>
            </div>

            <div v-if="props.view !== 'files' && selectedFile" class="mt-5 overflow-hidden rounded-xl border border-default bg-default">
              <div class="flex flex-col gap-3 border-b border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="font-medium text-highlighted">
                    {{ selectedFile.originalName }}
                  </p>
                  <p class="text-xs text-muted">
                    Inline view served from private R2 through the public read-only API
                  </p>
                </div>
                <UButton
                  :to="selectedFile.contentUrl"
                  target="_blank"
                  label="Open PDF"
                  icon="i-lucide-external-link"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </div>
              <iframe
                :key="selectedFile.id"
                :src="selectedFile.contentUrl"
                :title="`${selectedFile.originalName} PDF viewer`"
                class="h-[34rem] w-full bg-white sm:h-[44rem]"
              />
            </div>
          </section>

          <section
            v-if="props.view !== 'files'"
            :aria-labelledby="props.view === 'all' ? 'vectorize-heading' : undefined"
          >
            <div v-if="props.view === 'all'" class="mb-4">
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                02 / Semantic index
              </p>
              <h2 id="vectorize-heading" class="mt-1 text-2xl font-semibold text-highlighted">
                RAG Database
              </h2>
              <p v-if="indexResponse?.index" class="mt-2 text-sm text-muted">
                Index <code class="font-mono text-highlighted">{{ indexResponse.index.name }}</code>
              </p>
            </div>

            <UAlert
              v-if="indexError"
              color="error"
              variant="soft"
              icon="i-lucide-triangle-alert"
              title="Index metadata is unavailable"
              :description="indexError.message"
              class="mb-4"
            />

            <template v-if="props.view === 'rag-database'">
              <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div class="w-full sm:max-w-sm">
                  <label for="rag-file-filter" class="mb-1.5 block text-sm font-medium text-highlighted">
                    File
                  </label>
                  <USelect
                    id="rag-file-filter"
                    v-model="selectedFileId"
                    :items="fileFilterItems"
                    value-key="value"
                    icon="i-lucide-file-text"
                    placeholder="Select a file"
                    :disabled="!fileFilterItems.length"
                    class="w-full"
                  />
                </div>
                <span class="text-sm text-muted">
                  {{ vectorTotal.toLocaleString() }} chunk{{ vectorTotal === 1 ? '' : 's' }}
                </span>
              </div>

              <UTable
                :data="vectors"
                :columns="vectorColumns"
                :loading="vectorsLoading"
                empty="No indexed chunks available."
                class="overflow-hidden rounded-xl border border-default bg-default"
                :ui="{ tr: 'data-[selectable=true]:cursor-pointer' }"
                @select="selectVector"
              >
                <template #chunkIndex-cell="{ row }">
                  <span class="font-medium text-highlighted">Chunk {{ row.original.chunkIndex }}</span>
                </template>

                <template #sourceFilename-cell="{ row }">
                  <a
                    :href="row.original.sourceFileUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block truncate font-medium text-primary hover:underline"
                    :aria-label="`Open source file ${row.original.sourceFilename}`"
                    @click.stop
                  >
                    {{ row.original.sourceFilename }}
                  </a>
                </template>
              </UTable>

              <div v-if="vectorTotal" class="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-sm text-muted">
                  Showing {{ vectorPageStart }}–{{ vectorPageEnd }} of {{ vectorTotal.toLocaleString() }} chunks
                </p>
                <UPagination
                  v-if="vectorTotal > RAG_PAGE_SIZE"
                  v-model:page="vectorPage"
                  :total="vectorTotal"
                  :items-per-page="RAG_PAGE_SIZE"
                  size="sm"
                  :disabled="vectorsLoading"
                />
              </div>
            </template>

            <template v-else>
              <div v-if="indexStatus === 'pending' && !indexResponse" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-xl" />
              </div>

              <dl v-else-if="indexResponse?.index" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-xl border border-default bg-default p-5">
                  <dt class="text-sm text-muted">
                    Embedding model
                  </dt>
                  <dd class="mt-2 break-all font-mono text-sm font-semibold text-highlighted">
                    {{ indexResponse.index.embeddingModel }}
                  </dd>
                </div>
                <div class="rounded-xl border border-default bg-default p-5">
                  <dt class="text-sm text-muted">
                    Dimensions
                  </dt>
                  <dd class="mt-2 text-2xl font-bold text-highlighted">
                    {{ indexResponse.index.dimensions.toLocaleString() }}
                  </dd>
                </div>
                <div class="rounded-xl border border-default bg-default p-5">
                  <dt class="text-sm text-muted">
                    Distance metric
                  </dt>
                  <dd class="mt-2 text-2xl font-bold capitalize text-highlighted">
                    {{ indexResponse.index.metric }}
                  </dd>
                </div>
                <div class="rounded-xl border border-default bg-default p-5">
                  <dt class="text-sm text-muted">
                    Published vectors
                  </dt>
                  <dd class="mt-2 text-2xl font-bold text-highlighted">
                    {{ indexResponse.index.vectorCount.toLocaleString() }}
                  </dd>
                </div>
              </dl>
            </template>

            <LibraryEmbeddingProjection
              v-if="props.view === 'all' && indexResponse?.index && vectors.length"
              :vectors="vectors"
              :model="indexResponse.index.embeddingModel"
              :dimensions="indexResponse.index.dimensions"
              :metric="indexResponse.index.metric"
            />

            <UAlert
              v-if="vectorsError"
              color="error"
              variant="soft"
              icon="i-lucide-database-zap"
              title="Vector records are unavailable"
              :description="vectorsError"
              class="mt-4"
            />

            <div v-if="props.view === 'all'" class="mt-5 space-y-3">
              <article
                v-for="vector in vectors"
                :key="vector.vectorId"
                class="rounded-xl border border-default bg-default p-5"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge color="neutral" variant="soft" :label="`Page ${vector.pageNumber ?? '—'}`" />
                      <UBadge color="neutral" variant="outline" :label="`Chunk ${vector.chunkIndex}`" />
                      <UBadge color="primary" variant="soft" :label="vector.embeddingModel" />
                      <span class="text-xs text-muted">{{ vector.dimensions.toLocaleString() }} dimensions</span>
                    </div>
                    <p class="mt-3 line-clamp-4 leading-6 text-toned">
                      {{ vector.textPreview }}
                    </p>
                  </div>
                  <div class="shrink-0 text-left text-xs text-muted sm:text-right">
                    <p>Magnitude {{ formatMagnitude(vector.magnitude) }}</p>
                    <p class="mt-1">
                      {{ formatDate(vector.indexedAt) }}
                    </p>
                  </div>
                </div>

                <div class="mt-4 grid gap-3 border-t border-default pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                  <div class="min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Vector ID
                    </p>
                    <code class="mt-1 block truncate font-mono text-xs text-highlighted">{{ vector.vectorId }}</code>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Numeric preview
                    </p>
                    <code class="mt-1 block truncate font-mono text-xs text-highlighted">{{ previewValues(vector.valuesPreview) }}</code>
                  </div>
                </div>
              </article>

              <USkeleton v-if="vectorsLoading && vectors.length === 0" class="h-48 rounded-xl" />

              <UCard v-if="!vectorsLoading && selectedFile && vectors.length === 0 && !vectorsError" class="text-center">
                <div class="py-8">
                  <UIcon name="i-lucide-orbit" class="mx-auto size-8 text-muted" />
                  <p class="mt-3 text-sm text-muted">
                    No published vector records were returned for this document.
                  </p>
                </div>
              </UCard>

              <div v-if="hasMoreVectors" class="flex justify-center pt-2">
                <UButton
                  label="Load more vectors"
                  icon="i-lucide-list-plus"
                  color="neutral"
                  variant="outline"
                  :loading="vectorsLoading"
                  @click="loadVectors(false)"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
