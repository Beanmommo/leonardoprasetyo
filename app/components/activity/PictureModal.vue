<script setup lang="ts">
import type { LeonardoActivity } from '#shared/types/activity'
import { ACTIVITY_IMAGE_SOURCE_MAX_BYTES } from '#shared/utils/activityImage'

const props = defineProps<{ activities: LeonardoActivity[] }>()
const emit = defineEmits<{
  close: [selection: { file: File, source: 'uploaded' | 'new' } | null]
}>()
const pictureInput = useTemplateRef('pictureInput')
const filter = ref('uploaded')
const search = ref('')
const selectingId = ref<string | null>(null)
const error = ref('')
const filters = [{ label: 'Uploaded', value: 'uploaded', icon: 'i-lucide-images' }]
const pictures = computed(() => {
  const seen = new Set<string>()
  return [...props.activities]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((activity): activity is LeonardoActivity & { imageUrl: string } => {
      if (!activity.imageUrl || seen.has(activity.imageUrl)) return false
      seen.add(activity.imageUrl)
      return true
    })
})
const filteredPictures = computed(() => pictures.value.filter(picture =>
  picture.title.toLowerCase().includes(search.value.trim().toLowerCase())))

function uploadPicture(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || selectingId.value) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > ACTIVITY_IMAGE_SOURCE_MAX_BYTES) {
    error.value = 'Choose a JPEG, PNG, or WebP picture up to 10 MiB.'
    return
  }
  emit('close', { file, source: 'new' })
}

async function selectPicture(picture: LeonardoActivity & { imageUrl: string }) {
  if (selectingId.value) return
  selectingId.value = picture.id
  error.value = ''
  try {
    // Saved activity pictures are already cropped. Reuse their bytes through
    // the existing upload flow so later changes to the source cannot affect this activity.
    const blob = await $fetch<Blob>(picture.imageUrl, { responseType: 'blob' })
    const file = new File([blob], 'activity-avatar.jpg', { type: 'image/jpeg' })
    emit('close', { file, source: 'uploaded' })
  } catch {
    error.value = 'This picture could not be loaded. Try again or upload another picture.'
  } finally {
    selectingId.value = null
  }
}
</script>

<template>
  <UModal
    title="Choose picture"
    description="Choose an uploaded picture to apply it, or upload a new picture to crop."
    :dismissible="!selectingId"
    :close="!selectingId"
    :ui="{ content: 'sm:max-w-2xl', footer: 'justify-end' }"
    @update:open="open => { if (!open) emit('close', null) }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UTabs
            v-model="filter"
            :items="filters"
            :content="false"
            variant="link"
          />
          <UButton
            label="Upload picture"
            icon="i-lucide-upload"
            :disabled="Boolean(selectingId)"
            @click="pictureInput?.click()"
          />
          <input
            ref="pictureInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            @change="uploadPicture"
          >
        </div>

        <UInput
          v-if="pictures.length"
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search pictures by activity title"
          aria-label="Search uploaded pictures"
          class="w-full"
        />

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :title="error"
        />

        <div v-if="filteredPictures.length" class="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-4" :aria-busy="Boolean(selectingId)">
          <button
            v-for="picture in filteredPictures"
            :key="picture.id"
            type="button"
            :aria-label="`Use picture from ${picture.title}`"
            :disabled="Boolean(selectingId)"
            class="group relative cursor-pointer rounded-lg border border-default p-3 text-left transition hover:border-primary hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
            @click="selectPicture(picture)"
          >
            <img
              :src="picture.imageUrl"
              alt=""
              loading="lazy"
              class="mx-auto aspect-square w-full rounded-full object-cover"
            >
            <span class="mt-3 block truncate text-sm text-toned group-hover:text-highlighted" :title="picture.title">{{ picture.title }}</span>
            <UIcon v-if="selectingId === picture.id" name="i-lucide-loader-circle" class="absolute right-2 top-2 size-5 animate-spin text-primary" />
          </button>
        </div>
        <div v-else class="py-10 text-center">
          <UIcon name="i-lucide-images" class="size-10 text-muted" />
          <p class="mt-3 font-medium text-highlighted">
            {{ pictures.length ? 'No matching pictures' : 'No uploaded pictures yet' }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ pictures.length ? 'Try another activity title.' : 'Upload a picture to crop it for this activity.' }}
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="Boolean(selectingId)"
        @click="emit('close', null)"
      />
    </template>
  </UModal>
</template>
