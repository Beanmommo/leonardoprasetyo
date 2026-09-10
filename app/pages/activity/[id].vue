<script setup lang="ts">
import type { LeonardoActivityResponse } from '#shared/types/activity'

const route = useRoute()
const { data, error } = await useFetch<LeonardoActivityResponse>(() => `/api/leonardo-activity/${route.params.id}`)
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  throw createError({
    statusCode: statusCode === 400 ? 404 : statusCode,
    statusMessage: statusCode === 404 || statusCode === 400 ? 'Milestone not found' : 'Milestone could not be loaded'
  })
}
const activity = computed(() => data.value?.activity)
useSeoMeta({
  title: () => activity.value ? `${activity.value.title} | Leonardo Prasetyo` : 'Milestone | Leonardo Prasetyo',
  description: () => activity.value?.description,
  ogType: 'article'
})
const dateFormatter = new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone: 'UTC' })
</script>

<template>
  <UDashboardPanel id="milestone" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~/activity/milestone</span>
        </template>
      </Navbar>
    </template>
    <template #body>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-20 sm:px-8 lg:pt-24">
        <article v-if="activity" class="mx-auto max-w-3xl">
          <UButton
            :to="`/leonardo-activity#activity-${activity.id}`"
            label="Back to timeline"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="link"
            class="mb-10 px-0"
          />
          <header>
            <div class="flex items-center gap-4">
              <UAvatar
                :src="activity.imageUrl || undefined"
                :alt="activity.title"
                icon="i-lucide-flag"
                size="3xl"
                class="shrink-0"
              />
              <div class="min-w-0">
                <h1 class="break-words text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
                  {{ activity.title }}
                </h1>
                <time :datetime="activity.date" class="mt-1 block text-sm text-muted">{{ dateFormatter.format(new Date(activity.date)) }}</time>
              </div>
            </div>
            <p v-if="activity.description" class="mt-5 whitespace-pre-wrap text-lg leading-8 text-toned">
              {{ activity.description }}
            </p>
          </header>
          <ActivityMarkdown v-if="activity.contentMarkdown" :content="activity.contentMarkdown" class="mt-10 border-t border-default pt-6" />
        </article>
      </div>
    </template>
  </UDashboardPanel>
</template>
