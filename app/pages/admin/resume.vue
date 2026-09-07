<script setup lang="ts">
import { LazyAdminUploadProgressModal } from '#components'

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
  task?: { id: string }
}

const MAX_PDF_BYTES = 10 * 1024 * 1024

useSeoMeta({
  title: 'Resume Administration | Leonardo Prasetyo',
  description: 'Upload and publish the downloadable resume PDF.',
  robots: 'noindex, nofollow'
})

const toast = useToast()
const overlay = useOverlay()
const uploadModal = overlay.create(LazyAdminUploadProgressModal)
const resumeInput = ref<HTMLInputElement | null>(null)
const selectedResumeFile = shallowRef<File | null>(null)
const resume = shallowRef<StoredResume | null>(null)
const resumeFallbackUrl = ref('/leonardo-prasetyo-resume.pdf')
const resumeLoading = ref(false)
const resumeUploading = ref(false)
const resumeError = ref<string | null>(null)

const {
  data: adminSession,
  status: sessionStatus,
  error: sessionError,
  refresh: refreshAdminSession
} = await useAdminSession()

watch(() => adminSession.value?.authorized, (authorized) => {
  if (import.meta.client && authorized) {
    void loadResume()
  } else if (!authorized) {
    resume.value = null
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

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data as { statusMessage?: string, message?: string } | undefined
    return data?.statusMessage || data?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

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
  const modal = uploadModal.open({
    filename: file.name,
    state: 'uploading'
  })
  try {
    const response = await $fetch<ResumeResponse>('/api/admin/library/resume', {
      method: 'PUT',
      body: file,
      headers: {
        'content-type': 'application/pdf',
        'x-filename': encodeURIComponent(file.name)
      }
    })
    if (!response.task) {
      throw new Error('The resume upload did not return an indexing task')
    }
    resume.value = response.resume
    selectedResumeFile.value = null
    if (resumeInput.value) resumeInput.value.value = ''
    uploadModal.patch({
      state: 'complete',
      taskId: response.task.id
    })
    toast.add({
      title: 'Resume published and queued',
      description: `${file.name} is now the downloadable resume and is being indexed for RAG.`,
      color: 'success',
      icon: 'i-lucide-circle-check'
    })

    const action = await modal.result
    if (action === 'view') {
      await navigateTo(`/admin/task/${response.task.id}`)
    }
  } catch (error) {
    uploadModal.patch({
      state: 'error',
      errorMessage: errorMessage(error, 'The resume PDF could not be uploaded and queued for indexing.')
    })
    toast.add({
      title: 'Resume upload failed',
      description: errorMessage(error, 'The resume PDF could not be uploaded and queued for indexing.'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    await loadResume()
    await modal.result
  } finally {
    resumeUploading.value = false
  }
}
</script>

<template>
  <AdminPage
    id="admin-resume"
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
        Resume PDF upload
      </h1>
      <p class="mt-3 max-w-2xl leading-7 text-toned">
        Replace the downloadable resume and publish it as the dedicated resume source for RAG.
      </p>
    </header>

    <UCard>
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="font-semibold text-highlighted">
              Resume PDF
            </h2>
            <p class="mt-1 text-sm text-muted">
              Replaces the PDF opened from the Resume sidebar link and indexes it as the dedicated resume RAG source.
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
  </AdminPage>
</template>
