<script setup lang="ts">
import type { AdminSession } from '#shared/types/admin'

defineProps<{
  id: string
  session: AdminSession | null | undefined
  pending: boolean
  error: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()

const route = useRoute()
const { clear } = useUserSession()

async function signOut() {
  await clear()
  await navigateTo('/admin')
}
</script>

<template>
  <UDashboardPanel :id="id" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~{{ route.path }}</span>
        </template>
        <UButton
          v-if="session?.authenticated"
          label="Sign out"
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="signOut"
        />
      </Navbar>
    </template>

    <template #body>
      <div class="min-h-full overflow-y-auto px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-24">
        <div class="mx-auto max-w-6xl space-y-8">
          <div v-if="pending" class="space-y-4">
            <USkeleton class="h-10 w-72" />
            <USkeleton class="h-52 rounded-xl" />
          </div>

          <UAlert
            v-else-if="error"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Unable to check administrator access"
            description="Please try again to load your administrator session."
            :actions="[{ label: 'Try again', color: 'error', variant: 'soft', onClick: () => emit('retry') }]"
          />

          <UCard v-else-if="!session?.authenticated" class="mx-auto max-w-xl text-center">
            <h1 class="text-2xl font-bold text-highlighted">
              Sign in required
            </h1>
            <UButton to="/admin" label="Go to admin sign in" class="mt-6" />
          </UCard>

          <UCard v-else-if="!session.authorized" class="mx-auto max-w-xl text-center">
            <div class="py-8">
              <UIcon name="i-lucide-shield-x" class="mx-auto size-10 text-error" />
              <h1 class="mt-6 text-2xl font-bold text-highlighted">
                Access denied
              </h1>
              <p class="mt-3 text-toned">
                The GitHub account <strong>@{{ session.user?.username }}</strong> is not an approved administrator.
              </p>
              <UButton
                label="Sign out"
                color="neutral"
                variant="soft"
                class="mt-7"
                @click="signOut"
              />
            </div>
          </UCard>

          <slot v-else />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
