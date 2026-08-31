<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

const open = defineModel<boolean>('open', { default: false })

const email = 'leonardo.prasetyo5@gmail.com'
const clipboard = useClipboard()
const toast = useToast()

function copyEmail() {
  clipboard.copy(email)
  toast.add({
    title: 'Email copied',
    description: email,
    icon: 'i-lucide-copy-check',
    color: 'success'
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Thanks for being so curious!"
    description="Leo welcomes the opportunity to keep in touch"
    :close="false"
    :dismissible="false"
    :ui="{ header: 'hidden', body: 'p-6 sm:p-8' }"
  >
    <template #body>
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UIcon name="i-lucide-sparkles" class="size-6" />
        </div>

        <h2 class="text-xl font-semibold text-highlighted sm:text-2xl">
          Thanks for being so curious!
        </h2>
        <p class="mt-2 text-sm text-muted sm:text-base">
          Leo welcomes the opportunity to keep in touch
        </p>

        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <UBadge
            as="button"
            type="button"
            label="Email"
            icon="i-lucide-mail"
            color="neutral"
            variant="soft"
            size="lg"
            class="cursor-pointer transition-colors hover:bg-elevated"
            @click="copyEmail"
          />

          <a
            href="https://github.com/Beanmommo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Leonardo's GitHub profile"
          >
            <UBadge
              label="GitHub"
              icon="i-simple-icons-github"
              trailing-icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="soft"
              size="lg"
              class="cursor-pointer transition-colors hover:bg-elevated"
            />
          </a>

          <a
            href="https://linkedin.com/in/lpra25"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Leonardo's LinkedIn profile"
          >
            <UBadge
              label="LinkedIn"
              icon="i-simple-icons-linkedin"
              trailing-icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="soft"
              size="lg"
              class="cursor-pointer transition-colors hover:bg-elevated"
            />
          </a>
        </div>

        <UButton
          label="Got it"
          color="neutral"
          class="mt-7 w-full justify-center"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
