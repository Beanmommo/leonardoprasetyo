<script setup lang="ts">
import security from '@comark/nuxt/plugins/security'

defineProps<{ content: string }>()

const StoryMarkdown = defineMarkdownComponent({
  name: 'MilestoneMarkdown',
  plugins: [security({
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'img', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedProtocols: ['https', 'http', 'mailto']
  })]
})
</script>

<template>
  <div class="milestone-prose min-w-0 break-words text-base leading-7 text-default">
    <StoryMarkdown :value="content" />
  </div>
</template>

<style scoped>
.milestone-prose :deep(h1), .milestone-prose :deep(h2), .milestone-prose :deep(h3) {
  margin-block: 1.5em 0.65em;
  font-weight: 650;
  line-height: 1.3;
}
.milestone-prose :deep(h1) { font-size: 1.75em; }
.milestone-prose :deep(h2) { font-size: 1.5em; }
.milestone-prose :deep(h3) { font-size: 1.25em; }
.milestone-prose :deep(p), .milestone-prose :deep(ul), .milestone-prose :deep(ol),
.milestone-prose :deep(blockquote), .milestone-prose :deep(pre), .milestone-prose :deep(table) { margin-block: 1em; }
.milestone-prose :deep(ul) { list-style: disc; padding-left: 1.5em; }
.milestone-prose :deep(ol) { list-style: decimal; padding-left: 1.5em; }
.milestone-prose :deep(a) { color: var(--ui-primary); text-decoration: underline; text-underline-offset: 3px; }
.milestone-prose :deep(img) { max-width: 100%; height: auto; border-radius: 0.75rem; margin-block: 1.5em; }
.milestone-prose :deep(blockquote) { border-left: 3px solid var(--ui-border-accented); padding-left: 1em; color: var(--ui-text-muted); }
.milestone-prose :deep(pre) { overflow-x: auto; padding: 1em; border-radius: 0.5rem; background: var(--ui-bg-elevated); }
.milestone-prose :deep(code) { font-family: var(--font-mono); font-size: 0.875em; }
.milestone-prose :deep(table) { display: block; overflow-x: auto; border-collapse: collapse; }
.milestone-prose :deep(th), .milestone-prose :deep(td) { border: 1px solid var(--ui-border); padding: 0.5em 0.75em; }
.milestone-prose :deep(hr) { border-color: var(--ui-border); margin-block: 2em; }
</style>
