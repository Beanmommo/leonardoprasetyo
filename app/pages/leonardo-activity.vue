<script setup lang="ts">
import type { LeonardoActivitiesResponse } from '#shared/types/activity'

useSeoMeta({
  title: 'Leonardo\'s Recent Activity | Leonardo Prasetyo',
  description: 'Recent projects, milestones, and professional updates from Leonardo Prasetyo.'
})

const {
  data,
  status,
  error,
  refresh
} = await useFetch<LeonardoActivitiesResponse>('/api/leonardo-activity', {
  key: 'leonardo-activity'
})

const activities = computed(() => data.value?.activities ?? [])
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
      <div class="min-h-full overflow-y-auto px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-24">
        <div class="mx-auto max-w-3xl">
          <ActivityFeed
            :activities="activities"
            :pending="status === 'pending'"
            :error="Boolean(error)"
            @refresh="refresh"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
