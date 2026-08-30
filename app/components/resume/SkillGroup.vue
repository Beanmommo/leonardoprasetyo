<script setup lang="ts">
defineProps<{
  title: string
  items: string[]
}>()
</script>

<template>
  <div>
    <h3 class="font-mono text-xs font-semibold uppercase tracking-wider text-highlighted">
      {{ title }}
    </h3>
    <div class="mt-3 flex flex-wrap gap-1.5">
      <span
        v-for="item in items"
        :key="item"
        class="rounded-md bg-default px-2 py-1 font-mono text-[11px] text-toned ring ring-default"
      >
        {{ item }}
      </span>
    </div>
  </div>
</template>
