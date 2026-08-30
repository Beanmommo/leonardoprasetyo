<script setup lang="ts">
defineProps<{
  title: string
  company: string
  period: string
}>()
</script>

<template>
  <article class="py-6 first:pt-0 last:pb-0">
    <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div>
        <h3 class="font-semibold text-highlighted">
          {{ title }}
        </h3>
        <p class="mt-1 text-sm text-toned">
          {{ company }}
        </p>
      </div>
      <span class="shrink-0 font-mono text-xs text-primary">{{ period }}</span>
    </div>
    <p class="mt-3 text-sm leading-6 text-muted">
      <slot />
    </p>
  </article>
</template>
