<script setup lang="ts">
import { NuxtLink } from '#components'
import type { LeonardoActivity } from '#shared/types/activity'

defineProps<{ items: LeonardoActivity[] }>()

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
})
</script>

<template>
  <ol class="w-full">
    <li
      v-for="(item, index) in items"
      :id="`activity-${item.id}`"
      :key="item.id"
      :data-activity-id="item.id"
      :data-activity-type="item.type"
      tabindex="-1"
      class="group relative flex scroll-mt-24 gap-3 outline-none sm:gap-4"
    >
      <div class="relative flex w-12 shrink-0 flex-col items-center gap-2">
        <UAvatar
          :src="item.imageUrl || undefined"
          :alt="item.title"
          :icon="item.type === 'milestone' ? 'i-lucide-flag' : 'i-lucide-sparkles'"
          :size="item.type === 'milestone' ? 'xl' : 'sm'"
          :class="item.type === 'milestone' ? 'ring-2 ring-primary/20' : ''"
        />
        <div v-if="index < items.length - 1" class="w-px flex-1 bg-accented" aria-hidden="true" />
      </div>
      <component
        :is="item.type === 'milestone' ? NuxtLink : 'div'"
        v-bind="item.type === 'milestone' ? { to: `/activity/${item.id}` } : {}"
        class="group/entry min-w-0 flex-1 rounded-lg pb-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        :class="item.type === 'milestone' ? 'pt-0' : 'pt-1'"
      >
        <div v-if="item.type === 'milestone'" class="grid grid-cols-[minmax(0,1fr)] items-start gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <h2 class="py-1.5 text-xl font-semibold leading-7 tracking-tight text-highlighted group-hover/entry:text-primary sm:py-1 sm:text-2xl sm:leading-8">
            {{ item.title }}
          </h2>
          <time
            v-if="item.date !== items[index - 1]?.date"
            :datetime="item.date"
            class="text-xs text-muted sm:py-3"
          >{{ dateFormatter.format(new Date(item.date)) }}</time>
        </div>
        <div v-else class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <time
            v-if="item.date !== items[index - 1]?.date"
            :datetime="item.date"
            class="text-xs text-muted sm:order-last sm:ml-auto"
          >{{ dateFormatter.format(new Date(item.date)) }}</time>
          <h2 class="w-full text-base font-medium text-highlighted sm:w-auto">
            {{ item.title }}
          </h2>
        </div>
        <p
          v-if="item.description"
          class="mt-2 whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-default ring ring-default"
          :class="item.type === 'milestone' ? 'bg-elevated/40 text-base leading-7 sm:text-lg sm:leading-8' : 'text-sm leading-6'"
        >
          {{ item.description }}
        </p>
      </component>
    </li>
  </ol>
</template>
