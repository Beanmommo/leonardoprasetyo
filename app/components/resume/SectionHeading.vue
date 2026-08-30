<script setup lang="ts">
defineProps<{
  index: string
  title: string
  compact?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-3" :class="compact ? 'flex-wrap' : ''">
    <span class="font-mono text-xs font-semibold text-primary">{{ index }}</span>
    <h2 class="font-mono font-semibold uppercase tracking-[0.14em] text-highlighted" :class="compact ? 'text-xs' : 'text-sm'">
      {{ title }}
    </h2>
    <span class="h-px min-w-8 flex-1 bg-default" />
  </div>
</template>
