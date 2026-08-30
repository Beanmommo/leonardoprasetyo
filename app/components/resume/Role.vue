<script setup lang="ts">
defineProps<{
  title: string
  period?: string
}>()
</script>

<template>
  <div>
    <div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <h4 class="font-semibold text-highlighted">
        {{ title }}
      </h4>
      <span v-if="period" class="shrink-0 font-mono text-xs text-muted">{{ period }}</span>
    </div>
    <div class="resume-copy mt-4 space-y-5 text-sm leading-6 text-toned">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.resume-copy :deep(ul) {
  display: grid;
  gap: 0.5rem;
  list-style: disc;
  padding-left: 1.15rem;
}

.resume-copy :deep(li)::marker {
  color: var(--ui-primary);
}
</style>
