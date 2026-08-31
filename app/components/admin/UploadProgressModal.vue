<script setup lang="ts">
type UploadModalState = 'uploading' | 'complete' | 'error'

const props = defineProps<{
  filename: string
  state: UploadModalState
  taskId?: string
  errorMessage?: string
}>()

const emit = defineEmits<{
  close: [action: 'close' | 'view']
}>()

const title = computed(() => {
  if (props.state === 'complete') return 'Upload complete'
  if (props.state === 'error') return 'Upload failed'
  return 'Uploading to R2'
})

const description = computed(() => {
  if (props.state === 'complete') {
    return 'The PDF is safely stored in R2 and indexing is running in the background. You can close this modal or leave the page.'
  }
  if (props.state === 'error') {
    return props.errorMessage || 'The PDF could not be uploaded and queued for indexing.'
  }
  return 'Keep this page open until the PDF finishes uploading.'
})
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
    :dismissible="false"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex items-center gap-4 rounded-xl border border-default bg-elevated/40 p-4">
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-xl"
          :class="state === 'complete' ? 'bg-success/10 text-success' : state === 'error' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'"
        >
          <UIcon
            :name="state === 'complete' ? 'i-lucide-circle-check' : state === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
            class="size-6"
            :class="{ 'animate-spin': state === 'uploading' }"
          />
        </span>
        <div class="min-w-0">
          <p class="truncate font-medium text-highlighted">
            {{ filename }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ state === 'complete' ? 'Indexing task created' : state === 'error' ? 'Action required' : 'Transferring PDF…' }}
          </p>
        </div>
      </div>
    </template>

    <template v-if="state !== 'uploading'" #footer>
      <UButton
        v-if="state === 'complete' && taskId"
        label="See indexing process"
        icon="i-lucide-list-checks"
        @click="emit('close', 'view')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        label="Close"
        @click="emit('close', 'close')"
      />
    </template>
  </UModal>
</template>
