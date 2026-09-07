<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import { LazyActivityCropModal, LazyModalConfirm } from '#components'
import { ACTIVITY_IMAGE_SOURCE_MAX_BYTES } from '#shared/utils/activityImage'
import type {
  LeonardoActivitiesResponse,
  LeonardoActivity,
  LeonardoActivityInput,
  LeonardoActivityOrderInput,
  LeonardoActivityResponse
} from '#shared/types/activity'

type ActivityDraft = {
  date: string
  title: string
  description: string
}

useSeoMeta({
  title: 'Activity Administration | Leonardo Prasetyo',
  description: 'Private controls for Leonardo\'s public activity timeline.',
  robots: 'noindex, nofollow'
})

const toast = useToast()
const overlay = useOverlay()
const deleteModal = overlay.create(LazyModalConfirm)
const cropModal = overlay.create(LazyActivityCropModal)
const pictureInput = useTemplateRef('pictureInput')
const croppedPicture = shallowRef<File | null>(null)
const croppedPictureUrl = ref('')
const existingPictureUrl = ref<string | null>(null)
const removePicture = ref(false)
const croppingPicture = ref(false)
const picturePreview = computed(() => croppedPictureUrl.value || (!removePicture.value && existingPictureUrl.value) || '')
const activities = ref<LeonardoActivity[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const reorderingId = ref<string | null>(null)
const busy = computed(() => saving.value || croppingPicture.value || Boolean(deletingId.value) || Boolean(reorderingId.value))

const {
  data: adminSession,
  status: sessionStatus,
  error: sessionError,
  refresh: refreshAdminSession
} = await useAdminSession()

const draft = reactive<ActivityDraft>(emptyDraft())
const isEditing = computed(() => editingId.value !== null)
const canSubmit = computed(() => (
  draft.title.trim().length > 0
  && draft.title.trim().length <= 120
  && draft.description.trim().length <= 2000
  && Boolean(draft.date)
  && !Number.isNaN(new Date(draft.date).getTime())
))

watch(() => adminSession.value?.authorized, (authorized) => {
  if (import.meta.client && authorized) {
    void loadActivities()
  } else if (!authorized) {
    activities.value = []
    resetForm()
  }
}, { immediate: true })

function emptyDraft(): ActivityDraft {
  const now = new Date()
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return {
    date: localNow.toISOString().slice(0, 10),
    title: '',
    description: ''
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = error.data as { statusMessage?: string, message?: string } | undefined
    return data?.statusMessage || data?.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

async function loadActivities() {
  if (!adminSession.value?.authorized || loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const response = await $fetch<LeonardoActivitiesResponse>('/api/admin/leonardo-activity')
    activities.value = response.activities
  } catch (error) {
    loadError.value = errorMessage(error, 'Unable to load the activity timeline.')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  clearCroppedPicture()
  existingPictureUrl.value = null
  removePicture.value = false
  editingId.value = null
  Object.assign(draft, emptyDraft())
}

function editActivity(activity: LeonardoActivity) {
  if (busy.value || loading.value) return
  clearCroppedPicture()
  existingPictureUrl.value = activity.imageUrl
  removePicture.value = false
  editingId.value = activity.id
  Object.assign(draft, {
    date: activity.date,
    title: activity.title,
    description: activity.description
  })
}

function clearCroppedPicture() {
  if (croppedPictureUrl.value) URL.revokeObjectURL(croppedPictureUrl.value)
  croppedPictureUrl.value = ''
  croppedPicture.value = null
}

onBeforeUnmount(clearCroppedPicture)

function removeSelectedPicture() {
  clearCroppedPicture()
  removePicture.value = true
}

async function choosePicture(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || busy.value || loading.value) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > ACTIVITY_IMAGE_SOURCE_MAX_BYTES) {
    toast.add({ title: 'Choose a JPEG, PNG, or WebP picture up to 10 MiB', color: 'error' })
    return
  }
  croppingPicture.value = true
  try {
    const instance = cropModal.open({ file })
    const cropped = await instance.result
    if (!cropped) return
    clearCroppedPicture()
    croppedPicture.value = cropped
    croppedPictureUrl.value = URL.createObjectURL(cropped)
    removePicture.value = false
  } finally {
    croppingPicture.value = false
  }
}

async function saveActivity() {
  if (!canSubmit.value || busy.value || loading.value) return
  saving.value = true

  const input: LeonardoActivityInput = {
    date: draft.date,
    title: draft.title.trim(),
    description: draft.description.trim(),
    removeImage: removePicture.value
  }

  try {
    let body: LeonardoActivityInput | FormData = input
    if (croppedPicture.value) {
      body = new FormData()
      body.append('data', JSON.stringify(input))
      body.append('image', croppedPicture.value)
    }
    const response = editingId.value
      ? await $fetch<LeonardoActivityResponse>(`/api/admin/leonardo-activity/${editingId.value}`, {
          method: 'PATCH',
          body
        })
      : await $fetch<LeonardoActivityResponse>('/api/admin/leonardo-activity', {
          method: 'POST',
          body
        })

    await loadActivities()
    void refreshNuxtData('leonardo-activity')
    toast.add({
      title: editingId.value ? 'Activity updated' : 'Activity published',
      description: response.activity.title,
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
    resetForm()
  } catch (error) {
    toast.add({
      title: isEditing.value ? 'Update failed' : 'Publishing failed',
      description: errorMessage(error, 'The activity could not be saved.'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    saving.value = false
  }
}

async function removeActivity(activity: LeonardoActivity) {
  if (busy.value || loading.value) return
  const instance = deleteModal.open({
    title: `Remove “${activity.title}”?`,
    description: 'This permanently removes the entry from Leonardo\'s public activity timeline.',
    color: 'error'
  })
  if (!await instance.result) return

  deletingId.value = activity.id
  try {
    await $fetch(`/api/admin/leonardo-activity/${activity.id}`, { method: 'DELETE' })
    await loadActivities()
    if (editingId.value === activity.id) resetForm()
    void refreshNuxtData('leonardo-activity')
    toast.add({
      title: 'Activity removed',
      description: activity.title,
      color: 'success',
      icon: 'i-lucide-trash-2'
    })
  } catch (error) {
    toast.add({
      title: 'Removal failed',
      description: errorMessage(error, 'The activity could not be removed.'),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    deletingId.value = null
  }
}

async function moveActivity(activity: LeonardoActivity, direction: LeonardoActivityOrderInput['direction']) {
  if (busy.value || loading.value) return
  reorderingId.value = activity.id

  try {
    const response = await $fetch<LeonardoActivitiesResponse>(`/api/admin/leonardo-activity/${activity.id}/order`, {
      method: 'PATCH',
      body: { direction }
    })
    activities.value = response.activities
    void refreshNuxtData('leonardo-activity')
    toast.add({ title: 'Activity order saved', color: 'success', icon: 'i-lucide-arrow-up-down' })
  } catch (error) {
    toast.add({
      title: 'Reordering failed',
      description: errorMessage(error, 'The activity order could not be saved.'),
      color: 'error'
    })
    await loadActivities()
  } finally {
    reorderingId.value = null
  }
}

const activeTab = ref('manage')
const tabs: TabsItem[] = [
  { label: 'Manage', icon: 'i-lucide-pencil', value: 'manage', slot: 'manage' },
  { label: 'Preview', icon: 'i-lucide-eye', value: 'preview', slot: 'preview' }
]

const columns: TableColumn<LeonardoActivity>[] = [
  { id: 'order', header: 'Order' },
  { accessorKey: 'title', header: 'Activity' },
  {
    id: 'date',
    accessorFn: activity => new Date(activity.date).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' }),
    header: 'Date'
  },
  { id: 'actions', header: 'Actions' }
]
</script>

<template>
  <AdminPage
    id="admin-leonardo-activity"
    :session="adminSession"
    :pending="sessionStatus === 'pending'"
    :error="Boolean(sessionError)"
    @retry="refreshAdminSession"
  >
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <UBadge
          color="warning"
          variant="soft"
          icon="i-lucide-lock-keyhole"
          label="PRIVATE ADMIN"
        />
        <h1 class="mt-4 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
          Activities
        </h1>
        <p class="mt-3 max-w-2xl leading-7 text-toned">
          Manage timeline entries, then preview how they appear on the public page.
        </p>
      </div>
      <UButton
        to="/leonardo-activity"
        label="View public page"
        icon="i-lucide-external-link"
        color="neutral"
        variant="outline"
      />
    </header>

    <UTabs
      v-model="activeTab"
      :items="tabs"
      :unmount-on-hide="false"
      variant="link"
      class="w-full"
    >
      <template #manage>
        <div class="space-y-6 pt-6">
          <UAlert
            v-if="loadError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Activities could not be loaded"
            :description="loadError"
            :actions="[{ label: 'Try again', color: 'error', variant: 'soft', onClick: () => loadActivities() }]"
          />

          <div class="grid items-start gap-8 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <UCard class="lg:sticky lg:top-6">
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="font-semibold text-highlighted">
                      {{ isEditing ? 'Edit activity' : 'Add activity' }}
                    </h2>
                    <p class="mt-1 text-sm text-muted">
                      {{ isEditing ? 'Update this timeline entry.' : 'Publish a new timeline entry.' }}
                    </p>
                  </div>
                  <UButton
                    v-if="isEditing"
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="busy"
                    @click="resetForm"
                  />
                </div>
              </template>

              <form @submit.prevent="saveActivity">
                <fieldset :disabled="busy || loading" class="space-y-5">
                  <UFormField label="Date" name="date" required>
                    <UInput v-model="draft.date" type="date" class="w-full" />
                  </UFormField>

                  <UFormField
                    label="Title"
                    name="title"
                    required
                    :hint="`${draft.title.length}/120`"
                  >
                    <UInput
                      v-model="draft.title"
                      placeholder="What happened?"
                      maxlength="120"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField
                    label="Description"
                    name="description"
                    :hint="`${draft.description.length}/2000`"
                  >
                    <UTextarea
                      v-model="draft.description"
                      placeholder="Add optional details about this update..."
                      maxlength="2000"
                      :rows="6"
                      autoresize
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Timeline picture" description="Optional. Crop a picture to use as this activity’s avatar.">
                    <div class="mt-2 flex items-center gap-3">
                      <UAvatar
                        :src="picturePreview || undefined"
                        :alt="draft.title || 'Activity picture'"
                        icon="i-lucide-sparkles"
                        size="xl"
                      />
                      <div class="flex flex-wrap gap-2">
                        <UButton
                          :label="picturePreview ? 'Replace picture' : 'Choose picture'"
                          icon="i-lucide-image-plus"
                          color="neutral"
                          variant="outline"
                          @click="pictureInput?.click()"
                        />
                        <UButton
                          v-if="picturePreview"
                          label="Remove picture"
                          color="neutral"
                          variant="ghost"
                          @click="removeSelectedPicture"
                        />
                      </div>
                    </div>
                    <input
                      ref="pictureInput"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      class="hidden"
                      @change="choosePicture"
                    >
                    <p v-if="croppedPicture" class="mt-2 text-xs text-muted">
                      Your cropped picture will upload when you save this activity.
                    </p>
                  </UFormField>

                  <UButton
                    type="submit"
                    block
                    :label="isEditing ? 'Save changes' : 'Publish activity'"
                    :icon="isEditing ? 'i-lucide-save' : 'i-lucide-send'"
                    :disabled="!canSubmit"
                    :loading="saving"
                  />
                </fieldset>
              </form>
            </UCard>
            <section class="min-w-0">
              <div class="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-xl font-semibold text-highlighted">
                    Published activities
                  </h2>
                  <p class="mt-1 text-sm text-muted">
                    {{ activities.length }} {{ activities.length === 1 ? 'entry' : 'entries' }} · Use the arrows to reorder. New entries appear first.
                  </p>
                </div>
                <UButton
                  icon="i-lucide-refresh-cw"
                  color="neutral"
                  variant="ghost"
                  aria-label="Refresh activities"
                  :loading="loading"
                  :disabled="busy || loading"
                  @click="loadActivities"
                />
              </div>

              <div v-if="loading && !activities.length" class="space-y-5">
                <USkeleton v-for="index in 3" :key="index" class="h-20 rounded-lg" />
              </div>
              <UCard v-else-if="!activities.length" class="text-center">
                <div class="py-10">
                  <UIcon name="i-lucide-calendar-plus" class="mx-auto size-10 text-muted" />
                  <h3 class="mt-4 font-semibold text-highlighted">
                    No activity yet
                  </h3>
                  <p class="mt-2 text-sm text-muted">
                    Complete the form to publish the first entry.
                  </p>
                </div>
              </UCard>
              <UTable
                v-else
                :data="activities"
                :columns="columns"
                class="rounded-xl border border-default"
              >
                <template #order-cell="{ row }">
                  <div class="flex items-center gap-1">
                    <UButton
                      icon="i-lucide-arrow-up"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Move ${row.original.title} up`"
                      title="Move up"
                      :disabled="busy || loading || row.index === 0"
                      @click="moveActivity(row.original, 'up')"
                    />
                    <span class="min-w-5 text-center text-xs tabular-nums text-muted">{{ row.original.order + 1 }}</span>
                    <UButton
                      icon="i-lucide-arrow-down"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Move ${row.original.title} down`"
                      title="Move down"
                      :disabled="busy || loading || row.index === activities.length - 1"
                      @click="moveActivity(row.original, 'down')"
                    />
                  </div>
                </template>
                <template #title-cell="{ row }">
                  <p class="max-w-xs whitespace-normal font-medium text-highlighted">
                    {{ row.original.title }}
                  </p>
                  <p v-if="row.original.description" class="mt-1 max-w-xs whitespace-normal line-clamp-3 text-sm text-muted">
                    {{ row.original.description }}
                  </p>
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex gap-2">
                    <UButton
                      label="Edit"
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      :disabled="busy || loading"
                      @click="editActivity(row.original)"
                    />
                    <UButton
                      label="Remove"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="soft"
                      size="xs"
                      :loading="deletingId === row.original.id"
                      :disabled="busy || loading"
                      @click="removeActivity(row.original)"
                    />
                  </div>
                </template>
              </UTable>
            </section>
          </div>
        </div>
      </template>

      <template #preview>
        <div class="mt-6 rounded-xl border border-default bg-default p-4 sm:p-8">
          <ActivityFeed
            :activities="activities"
            :pending="loading && !activities.length"
            :error="Boolean(loadError)"
            class="mx-auto max-w-3xl"
            @refresh="loadActivities"
          />
        </div>
      </template>
    </UTabs>
  </AdminPage>
</template>
