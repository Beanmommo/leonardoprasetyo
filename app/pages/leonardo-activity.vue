<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import type { LeonardoActivitiesPageResponse, LeonardoActivity, LeonardoActivityMapResponse } from '#shared/types/activity'

useSeoMeta({
  title: 'Leonardo\'s Recent Activity | Leonardo Prasetyo',
  description: 'Recent projects, milestones, and professional updates from Leonardo Prasetyo.'
})

const {
  data,
  status,
  error,
  refresh: fetchFirstPage
} = await useFetch<LeonardoActivitiesPageResponse>('/api/leonardo-activity', {
  key: 'leonardo-activity'
})

const activities = ref<LeonardoActivity[]>([])
const { data: mapData, refresh: refreshMap } = await useFetch<LeonardoActivityMapResponse>('/api/leonardo-activity/map', {
  key: 'leonardo-activity-map',
  lazy: true
})
const mapItems = computed(() => mapData.value?.activities ?? activities.value)
const scrollArea = useTemplateRef('scrollArea')
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)
const loadMoreError = ref(false)
const orderChanged = ref(false)
const nearBottom = ref(false)
const loadMoreTrigger = useTemplateRef('loadMoreTrigger')
const feedTop = useTemplateRef('feedTop')
let request: AbortController | undefined
let generation = 0

function cancelPageRequest() {
  generation++
  request?.abort()
  loadingMore.value = false
}

watch(status, (value) => {
  if (value === 'pending') cancelPageRequest()
})
watch(data, (page) => {
  cancelPageRequest()
  activities.value = page?.activities ?? []
  nextCursor.value = page?.nextCursor ?? null
  loadMoreError.value = false
  orderChanged.value = false
}, { immediate: true })
onBeforeUnmount(cancelPageRequest)

async function refresh() {
  cancelPageRequest()
  await Promise.all([fetchFirstPage(), refreshMap()])
  if (!error.value) feedTop.value?.scrollIntoView({ block: 'start' })
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value || status.value === 'pending' || error.value || orderChanged.value) return
  const currentGeneration = generation
  const controller = new AbortController()
  request = controller
  loadingMore.value = true
  loadMoreError.value = false
  try {
    const page = await $fetch<LeonardoActivitiesPageResponse>('/api/leonardo-activity', {
      query: { cursor: nextCursor.value },
      signal: controller.signal
    })
    if (currentGeneration !== generation) return
    const seen = new Set(activities.value.map(activity => activity.id))
    activities.value = [...activities.value, ...page.activities.filter(activity => !seen.has(activity.id))]
    nextCursor.value = page.nextCursor
  } catch (failure) {
    if (controller.signal.aborted || currentGeneration !== generation) return
    if (typeof failure === 'object' && failure !== null && 'statusCode' in failure && failure.statusCode === 409) {
      orderChanged.value = true
    } else {
      loadMoreError.value = true
    }
  } finally {
    if (currentGeneration === generation) loadingMore.value = false
  }
}

useIntersectionObserver(loadMoreTrigger, ([entry]) => {
  nearBottom.value = entry?.isIntersecting ?? false
}, { root: scrollArea, rootMargin: '300px' })

// Chat citations can point beyond the first page. Continue normal, bounded
// paging until that activity is available, then scroll to its existing anchor.
const route = useRoute()
const router = useRouter()
function selectActivity(id: string) {
  const target = document.getElementById(`activity-${id}`)
  if (target) {
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    target.focus({ preventScroll: true })
  }
  void router.replace({ hash: `#activity-${id}` })
}
const anchorId = computed(() => route.hash.startsWith('#activity-') ? route.hash.slice(1) : '')
const anchorResolved = ref(false)
watch(anchorId, () => {
  anchorResolved.value = false
})
watch([activities, anchorId], async () => {
  if (!import.meta.client || !anchorId.value || anchorResolved.value) return
  await nextTick()
  const target = document.getElementById(anchorId.value)
  if (target) {
    anchorResolved.value = true
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }
}, { immediate: true })

watch([nearBottom, nextCursor, loadingMore, status, loadMoreError, orderChanged, anchorId, anchorResolved], async () => {
  if (!import.meta.client || loadMoreError.value || orderChanged.value) return
  await nextTick()
  // The observer can still report its old position just after a page appends.
  // Check the updated layout before fetching again, so one scroll does not
  // eagerly drain all remaining pages. Short pages can still fill the viewport.
  const trigger = loadMoreTrigger.value?.getBoundingClientRect()
  const needsMoreVisibleItems = nearBottom.value && trigger && trigger.top <= (scrollArea.value?.getBoundingClientRect().bottom ?? window.innerHeight) + 300
  const needsAnchor = anchorId.value && !anchorResolved.value && !document.getElementById(anchorId.value)
  if (needsMoreVisibleItems || needsAnchor) {
    void loadMore()
  }
}, { immediate: true, flush: 'post' })
</script>

<template>
  <UDashboardPanel id="leonardo-activity" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~/leonardo-activity</span>
        </template>
      </Navbar>
    </template>

    <template #body>
      <div ref="scrollArea" class="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-20 sm:px-6 md:pr-24 lg:pl-10 lg:pr-28 lg:pt-24">
        <div class="mx-auto max-w-3xl">
          <div ref="feedTop" class="min-w-0 scroll-mt-24">
            <ActivityFeed
              :activities="activities"
              :pending="status === 'pending'"
              :error="Boolean(error)"
              @refresh="refresh"
            />
            <div v-if="activities.length && status !== 'pending' && !error" class="mt-8">
              <UAlert
                v-if="orderChanged"
                color="info"
                variant="soft"
                title="The activity timeline has changed"
                description="Refresh to continue with the updated order."
                :actions="[{ label: 'Refresh activities', onClick: refresh }]"
              />
              <div
                v-else
                ref="loadMoreTrigger"
                class="flex flex-col items-center gap-3 py-4"
                aria-live="polite"
              >
                <p v-if="loadMoreError" role="alert" class="text-sm text-error">
                  More activities could not be loaded. Please try again.
                </p>
                <UButton
                  v-if="nextCursor"
                  color="neutral"
                  variant="soft"
                  :loading="loadingMore"
                  @click="loadMore"
                >
                  {{ loadMoreError ? 'Try again' : 'Load more activities' }}
                </UButton>
                <p v-else class="text-sm text-muted">
                  No more activities
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ActivityMinimap
        v-if="activities.length && status !== 'pending' && !error"
        :items="mapItems"
        :loaded-ids="activities.map(item => item.id)"
        :scroll-root="scrollArea"
        class="fixed right-4 top-24 z-10 lg:right-6"
        @select="selectActivity"
      />
    </template>
  </UDashboardPanel>
</template>
