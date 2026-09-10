<script setup lang="ts">
import { useIntersectionObserver, useResizeObserver, usePreferredReducedMotion } from '@vueuse/core'
import type { LeonardoActivityMapEntry } from '#shared/types/activity'

const props = defineProps<{
  items: LeonardoActivityMapEntry[]
  loadedIds: string[]
  scrollRoot: HTMLElement | null
}>()
const emit = defineEmits<{ select: [id: string] }>()
const viewport = useTemplateRef('viewport')
const targets = shallowRef<HTMLElement[]>([])
const visibleIds = ref(new Set<string>())
const reducedMotion = usePreferredReducedMotion()
const activeIndex = computed(() => props.items.findIndex(item => visibleIds.value.has(item.id)))

watch(() => [props.loadedIds, props.scrollRoot], async () => {
  await nextTick()
  visibleIds.value = new Set()
  targets.value = Array.from(props.scrollRoot?.querySelectorAll<HTMLElement>('[data-activity-id]') ?? [])
}, { immediate: true, flush: 'post' })

useIntersectionObserver(targets, (entries) => {
  const next = new Set(visibleIds.value)
  for (const entry of entries) {
    const id = (entry.target as HTMLElement).dataset.activityId!
    if (entry.isIntersecting && entry.intersectionRect.height > 0) next.add(id)
    else next.delete(id)
  }
  visibleIds.value = next
}, {
  root: () => props.scrollRoot,
  // The fixed navbar obscures the top of the scrolling panel.
  rootMargin: '-64px 0px 0px 0px',
  threshold: 0
})

function followTimeline() {
  const element = viewport.value
  if (!element || activeIndex.value < 0) return
  const visibleIndices = props.items.flatMap((item, index) => visibleIds.value.has(item.id) ? [index] : [])
  const center = (activeIndex.value + (visibleIndices.at(-1) ?? activeIndex.value) + 1) * 12
  element.scrollTo({
    top: Math.max(0, center - element.clientHeight / 2),
    behavior: reducedMotion.value === 'reduce' ? 'instant' : 'smooth'
  })
}
watch([activeIndex, () => props.items.length], followTimeline, { flush: 'post' })
useResizeObserver(viewport, followTimeline)
</script>

<template>
  <nav aria-label="Activity minimap" class="hidden w-16 md:block">
    <div ref="viewport" class="minimap-viewport max-h-[55dvh] overflow-y-auto overscroll-contain">
      <button
        v-for="(item, index) in items"
        :key="item.id"
        type="button"
        :data-map-id="item.id"
        :aria-label="`${item.type === 'milestone' ? 'Milestone' : 'Activity'}: ${item.title}, ${item.date}`"
        :aria-current="index === activeIndex ? 'location' : undefined"
        :title="`${item.title} · ${item.date}`"
        class="flex h-6 w-full items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-primary"
        @click="emit('select', item.id)"
      >
        <span
          class="rounded-full bg-primary transition-opacity duration-200 motion-reduce:transition-none"
          :class="[
            item.type === 'milestone' ? 'h-1 w-11' : 'h-0.5 w-6',
            visibleIds.has(item.id) ? 'opacity-100' : 'opacity-40'
          ]"
        />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.minimap-viewport { scrollbar-width: none; }
.minimap-viewport::-webkit-scrollbar { display: none; }
</style>
