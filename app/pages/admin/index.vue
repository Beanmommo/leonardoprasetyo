<script setup lang="ts">
useSeoMeta({
  title: 'Admin Sign In | Leonardo Prasetyo',
  description: 'Sign in with GitHub to manage the resume, RAG documents, and activities.',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <UDashboardPanel id="admin-sign-in" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <Navbar>
        <template #title>
          <span class="font-mono text-xs font-medium tracking-wider text-muted">~/admin</span>
        </template>
      </Navbar>
    </template>

    <template #body>
      <div class="min-h-full overflow-y-auto px-4 pb-10 pt-20 sm:px-6 lg:px-10 lg:pt-24">
        <UCard class="mx-auto max-w-xl text-center">
          <div class="py-10">
            <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UIcon name="i-simple-icons-github" class="size-7" />
            </div>
            <h1 class="mt-6 text-2xl font-bold text-highlighted">
              Administration
            </h1>
            <p class="mx-auto mt-3 max-w-md leading-7 text-toned">
              Sign in with the approved GitHub account to manage the resume, RAG documents, and activities.
            </p>
            <UButton
              to="/auth/github"
              external
              label="Sign in with GitHub"
              icon="i-simple-icons-github"
              size="lg"
              class="mt-7"
            />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
