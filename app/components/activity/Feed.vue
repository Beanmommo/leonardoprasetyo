<script setup lang="ts">
import type { LeonardoActivity } from '#shared/types/activity'

withDefaults(defineProps<{
  activities: LeonardoActivity[]
  pending?: boolean
  error?: boolean
}>(), {
  pending: false,
  error: false
})

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <div>
    <header>
      <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
        Leonardo's recent activity
      </h1>
    </header>

    <div v-if="pending" class="mt-10 space-y-6">
      <div v-for="index in 3" :key="index" class="flex gap-4">
        <USkeleton class="size-8 shrink-0 rounded-full" />
        <div class="flex-1 space-y-3">
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>

    <UAlert
      v-else-if="error"
      class="mt-10"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Activity is unavailable"
      description="Leonardo's recent activity could not be loaded."
      :actions="[{ label: 'Try again', color: 'error', variant: 'soft', onClick: () => emit('refresh') }]"
    />

    <UCard v-else-if="!activities.length" class="mt-10 text-center">
      <div class="py-10">
        <UIcon name="i-lucide-calendar-clock" class="mx-auto size-10 text-muted" />
        <h2 class="mt-4 font-semibold text-highlighted">
          No activity yet
        </h2>
        <p class="mt-2 text-sm text-muted">
          New updates will appear here when they are published.
        </p>
      </div>
    </UCard>

    <ActivityTimeline v-else :items="activities" class="mt-10" />
  </div>
</template>
