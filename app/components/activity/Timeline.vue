<script setup lang="ts">
import type { TimelineItem } from '@nuxt/ui'
import type { LeonardoActivity } from '#shared/types/activity'

const props = defineProps<{
  items: LeonardoActivity[]
}>()

type ActivityTimelineItem = TimelineItem & LeonardoActivity & {
  showDate: boolean
}

const timelineItems = computed<ActivityTimelineItem[]>(() => props.items.map((activity, index) => {
  const showDate = activity.date !== props.items[index - 1]?.date

  return {
    ...activity,
    showDate,
    value: activity.id,
    icon: 'i-lucide-sparkles',
    avatar: activity.imageUrl ? { src: activity.imageUrl, alt: activity.title } : undefined,
    ui: {
      date: showDate ? undefined : 'hidden',
      description: !activity.description ? 'hidden' : undefined
    }
  }
}))

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
})

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value))
}
</script>

<template>
  <UTimeline
    :items="timelineItems"
    size="sm"
    :ui="{
      date: 'sm:float-end sm:ms-4',
      title: 'text-base',
      description: 'px-4 py-3 ring ring-default mt-2 rounded-lg text-default'
    }"
    class="w-full"
  >
    <template #title="{ item }">
      <span :id="`activity-${item.id}`" class="scroll-mt-24">{{ item.title }}</span>
    </template>

    <template #date="{ item }">
      <time v-if="item.showDate" :datetime="item.date" :title="formatDate(item.date)">
        {{ formatDate(item.date) }}
      </time>
    </template>

    <template #description="{ item }">
      <p v-if="item.description" class="whitespace-pre-wrap leading-6">
        {{ item.description }}
      </p>
    </template>
  </UTimeline>
</template>
