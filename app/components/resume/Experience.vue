<script setup lang="ts">
defineProps<{
  company: string
  location: string
  period: string
  description: string
}>()
</script>

<template>
  <article class="relative border-l border-default pl-6 sm:pl-8">
    <span class="absolute -left-1 top-2 size-2 rounded-full bg-primary ring-4 ring-default" />
    <div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <h3 class="text-xl font-bold text-highlighted">
        {{ company }}
      </h3>
      <span class="shrink-0 font-mono text-xs text-primary">{{ period }}</span>
    </div>
    <p class="mt-1 font-mono text-xs text-muted">
      {{ location }}
    </p>
    <p class="mt-3 text-sm leading-6 text-muted">
      {{ description }}
    </p>
    <div class="mt-6 space-y-8">
      <slot />
    </div>
  </article>
</template>
