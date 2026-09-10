<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { TableKit } from '@tiptap/extension-table'

const props = defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ required: true })
const storyEditor = useTemplateRef('storyEditor')
const extensions = [TableKit]

// Contenteditable does not inherit the form fieldset's disabled state.
watchEffect(() => {
  storyEditor.value?.editor?.setEditable(!props.disabled, false)
})

const toolbarItems: EditorToolbarItem[][] = [
  [{
    'icon': 'i-lucide-heading',
    'aria-label': 'Text style',
    'tooltip': { text: 'Text style' },
    'items': [
      { kind: 'paragraph', label: 'Paragraph', icon: 'i-lucide-pilcrow' },
      { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
      { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' }
    ]
  }],
  [
    { 'kind': 'mark', 'mark': 'bold', 'icon': 'i-lucide-bold', 'aria-label': 'Bold', 'tooltip': { text: 'Bold' } },
    { 'kind': 'mark', 'mark': 'italic', 'icon': 'i-lucide-italic', 'aria-label': 'Italic', 'tooltip': { text: 'Italic' } },
    { 'kind': 'mark', 'mark': 'strike', 'icon': 'i-lucide-strikethrough', 'aria-label': 'Strikethrough', 'tooltip': { text: 'Strikethrough' } },
    { 'kind': 'mark', 'mark': 'code', 'icon': 'i-lucide-code', 'aria-label': 'Inline code', 'tooltip': { text: 'Inline code' } }
  ],
  [
    { 'kind': 'bulletList', 'icon': 'i-lucide-list', 'aria-label': 'Bullet list', 'tooltip': { text: 'Bullet list' } },
    { 'kind': 'orderedList', 'icon': 'i-lucide-list-ordered', 'aria-label': 'Numbered list', 'tooltip': { text: 'Numbered list' } },
    { 'kind': 'blockquote', 'icon': 'i-lucide-text-quote', 'aria-label': 'Quote', 'tooltip': { text: 'Quote' } },
    { 'kind': 'codeBlock', 'icon': 'i-lucide-square-code', 'aria-label': 'Code block', 'tooltip': { text: 'Code block' } }
  ],
  [
    { 'kind': 'link', 'icon': 'i-lucide-link', 'aria-label': 'Link', 'tooltip': { text: 'Add or remove link' } },
    { 'kind': 'image', 'icon': 'i-lucide-image', 'aria-label': 'Insert image', 'tooltip': { text: 'Insert image by URL' } }
  ],
  [
    { 'kind': 'undo', 'icon': 'i-lucide-undo', 'aria-label': 'Undo', 'tooltip': { text: 'Undo' } },
    { 'kind': 'redo', 'icon': 'i-lucide-redo', 'aria-label': 'Redo', 'tooltip': { text: 'Redo' } }
  ]
]
</script>

<template>
  <UEditor
    ref="storyEditor"
    v-slot="{ editor }"
    v-model="model"
    content-type="markdown"
    :editable="!disabled"
    :extensions="extensions"
    :mention="false"
    :starter-kit="{ underline: false }"
    :placeholder="{ placeholder: 'Tell the story behind this milestone…', mode: 'firstLine' }"
    role="textbox"
    aria-label="Milestone story"
    aria-multiline="true"
    :aria-disabled="disabled || undefined"
    class="overflow-hidden rounded-lg border border-default bg-default focus-within:ring-2 focus-within:ring-primary"
    :ui="{
      base: 'min-h-72 max-h-[60dvh] overflow-y-auto p-4 sm:px-4 break-words [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-default [&_td]:p-2 [&_th]:border [&_th]:border-default [&_th]:p-2 [&_th]:bg-elevated'
    }"
  >
    <UEditorToolbar
      :key="disabled ? 'disabled' : 'editable'"
      :editor="editor"
      :items="toolbarItems"
      aria-label="Story formatting"
      class="flex-wrap border-b border-default bg-elevated/50 p-2"
    />
  </UEditor>
</template>
