<script setup lang="ts">
import { ACTIVITY_IMAGE_MAX_BYTES, ACTIVITY_IMAGE_QUALITY, ACTIVITY_IMAGE_SIZE } from '#shared/utils/activityImage'

const props = defineProps<{ file: File }>()
const emit = defineEmits<{ close: [File | null] }>()
const imageElement = useTemplateRef('imageElement')
const sourceUrl = ref('')
const width = ref(0)
const height = ref(0)
const zoom = ref(1)
const horizontal = ref(50)
const vertical = ref(50)
const error = ref('')
const cropping = ref(false)
const cropSize = computed(() => Math.min(width.value, height.value) / zoom.value)
const cropX = computed(() => (width.value - cropSize.value) * horizontal.value / 100)
const cropY = computed(() => (height.value - cropSize.value) * vertical.value / 100)
const imageStyle = computed(() => cropSize.value
  ? {
      width: `${width.value / cropSize.value * 100}%`,
      height: `${height.value / cropSize.value * 100}%`,
      left: `${-cropX.value / cropSize.value * 100}%`,
      top: `${-cropY.value / cropSize.value * 100}%`
    }
  : { width: '100%' })

onMounted(() => {
  sourceUrl.value = URL.createObjectURL(props.file)
})
onBeforeUnmount(() => {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value)
})

function loaded() {
  width.value = imageElement.value?.naturalWidth || 0
  height.value = imageElement.value?.naturalHeight || 0
}

let drag: { x: number, y: number, horizontal: number, vertical: number, viewport: number } | null = null
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !cropSize.value || cropping.value) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  drag = {
    x: event.clientX, y: event.clientY,
    horizontal: horizontal.value, vertical: vertical.value,
    viewport: target.getBoundingClientRect().width
  }
}

function moveDrag(event: PointerEvent) {
  if (!drag) return
  const scale = cropSize.value / drag.viewport
  const clamp = (value: number) => Math.min(100, Math.max(0, value))
  if (width.value > cropSize.value) {
    horizontal.value = clamp(drag.horizontal - (event.clientX - drag.x) * scale / (width.value - cropSize.value) * 100)
  }
  if (height.value > cropSize.value) {
    vertical.value = clamp(drag.vertical - (event.clientY - drag.y) * scale / (height.value - cropSize.value) * 100)
  }
}

async function confirmCrop() {
  if (!imageElement.value || !cropSize.value || cropping.value) return
  cropping.value = true
  error.value = ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = ACTIVITY_IMAGE_SIZE
    canvas.height = ACTIVITY_IMAGE_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not crop this picture.')
    context.imageSmoothingQuality = 'high'
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(imageElement.value, cropX.value, cropY.value, cropSize.value, cropSize.value, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', ACTIVITY_IMAGE_QUALITY))
    if (!blob || blob.size > ACTIVITY_IMAGE_MAX_BYTES) throw new Error('This picture could not be cropped. Try another image.')
    emit('close', new File([blob], 'activity-avatar.jpg', { type: 'image/jpeg' }))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not crop this picture.'
  } finally {
    cropping.value = false
  }
}
</script>

<template>
  <UModal
    title="Crop activity picture"
    description="Drag to position your picture and adjust the zoom. The circle shows your timeline avatar."
    :close="false"
    :dismissible="false"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-5">
        <div
          class="relative mx-auto aspect-square w-full max-w-80 touch-none cursor-move overflow-hidden rounded-lg bg-muted select-none"
          @pointerdown="startDrag"
          @pointermove="moveDrag"
          @pointerup="drag = null"
          @pointercancel="drag = null"
          @lostpointercapture="drag = null"
        >
          <img
            v-if="sourceUrl"
            ref="imageElement"
            :src="sourceUrl"
            alt="Picture crop preview"
            draggable="false"
            class="pointer-events-none absolute max-w-none"
            :style="imageStyle"
            @load="loaded"
            @error="error = 'Unable to open this picture. Choose a JPEG, PNG, or WebP image.'"
          >
          <div class="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_80px_#0006]" />
        </div>
        <fieldset :disabled="!cropSize || cropping" class="space-y-3">
          <label class="flex flex-col gap-1 text-sm">
            Zoom
            <input
              v-model.number="zoom"
              type="range"
              min="1"
              max="4"
              step="0.01"
              class="w-full accent-primary"
            >
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Horizontal position
            <input
              v-model.number="horizontal"
              type="range"
              min="0"
              max="100"
              step="0.1"
              :disabled="width <= cropSize"
              class="w-full accent-primary"
            >
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Vertical position
            <input
              v-model.number="vertical"
              type="range"
              min="0"
              max="100"
              step="0.1"
              :disabled="height <= cropSize"
              class="w-full accent-primary"
            >
          </label>
        </fieldset>
        <UAlert v-if="error" color="error" :title="error" />
      </div>
    </template>
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="cropping"
        @click="emit('close', null)"
      />
      <UButton
        label="Use cropped picture"
        icon="i-lucide-crop"
        :disabled="!cropSize || Boolean(error)"
        :loading="cropping"
        @click="confirmCrop"
      />
    </template>
  </UModal>
</template>
