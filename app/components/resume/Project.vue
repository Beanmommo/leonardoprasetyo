<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div>
    <p class="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-highlighted">
      {{ title }}
    </p>
    <slot />
  </div>
</template>
