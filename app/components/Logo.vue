<script setup lang="ts">
const maskId = useId()
</script>

<template>
  <svg
    viewBox="0 0 160 160"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <mask
        :id="maskId"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="160"
        height="160"
      >
        <rect width="160" height="160" fill="white" />
        <path fill="black" d="M76 106h43v13c0 13-8.6 21-21.5 21S76 132 76 119v-13Z" />
        <path
          fill="none"
          stroke="black"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="7"
          d="M119 112h8.5c5.8 0 9.5 3.8 9.5 9s-3.7 9-9.5 9H119"
        />
      </mask>
    </defs>
    <path
      fill="currentColor"
      :mask="`url(#${maskId})`"
      d="M26 12h32c3.3 0 6 2.7 6 6v74c0 3.3 2.7 6 6 6h68c3.3 0 6 2.7 6 6v36c0 3.3-2.7 6-6 6H26c-3.3 0-6-2.7-6-6V18c0-3.3 2.7-6 6-6Z"
    />
  </svg>
</template>
