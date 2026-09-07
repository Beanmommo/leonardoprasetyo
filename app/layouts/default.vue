<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { LazyModalConfirm, LazyModalRename } from '#components'

const { loggedIn } = useUserSession()
const route = useRoute()
const toast = useToast()
const overlay = useOverlay()
const {
  chats: localChats,
  hydrate,
  renameChat: renameLocalChat,
  deleteChat: deleteLocalChat
} = useLocalChats()

const sidebarOpen = ref(false)

const chats = computed(() => localChats.value.map(chat => ({
  id: chat.id,
  label: chat.title || 'Untitled',
  to: `/chat/${chat.id}`,
  icon: 'i-lucide-message-circle',
  createdAt: chat.updatedAt
})))

const renameModal = overlay.create(LazyModalRename)
const deleteModal = overlay.create(LazyModalConfirm, {
  props: {
    title: 'Delete local chat',
    description: 'This removes the conversation from this browser only. This cannot be undone.',
    color: 'error'
  }
})

onMounted(hydrate)

watch(loggedIn, () => {
  sidebarOpen.value = false
})

const { groups } = useChats(chats)

const items = computed(() => groups.value?.flatMap((group) => {
  return [{
    label: group.label,
    type: 'label' as const
  }, ...group.items.map(item => ({
    ...item,
    slot: 'chat' as const,
    icon: undefined,
    class: item.label === 'Untitled' ? 'text-muted' : ''
  }))]
}))

async function renameChat(item: { id: string, label: string }) {
  const instance = renameModal.open({ title: item.label === 'Untitled' ? '' : item.label })
  const result = await instance.result
  if (!result || result === item.label) return
  renameLocalChat(item.id, result)
}

async function deleteChat(id: string) {
  const instance = deleteModal.open()
  if (!await instance.result) return

  deleteLocalChat(id)
  toast.add({
    title: 'Chat deleted',
    description: 'The conversation was removed from this browser.',
    icon: 'i-lucide-trash'
  })

  if (route.params.id === id) {
    await navigateTo('/')
  }
}

function getChatActions(item: { id: string, label: string }): DropdownMenuItem[][] {
  return [[
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: () => renameChat(item)
    }
  ], [
    {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => deleteChat(item.id)
    }
  ]]
}

defineShortcuts({
  meta_o: () => {
    navigateTo('/')
  }
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="sidebarOpen"
      :min-size="12"
      collapsible
      resizable
      :menu="{ inset: true }"
      class="border-r-0 py-4 dark:[--ui-bg-elevated:var(--ui-color-neutral-900)]"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          v-if="!collapsed"
          to="/"
          class="flex items-end gap-2 outline-primary/25 focus-visible:outline-3 rounded-md"
        >
          <Logo class="h-6 w-auto shrink-0 text-primary" />
          <span class="text-xl font-bold text-highlighted">Prasetyo</span>
        </NuxtLink>

        <UDashboardSidebarCollapse class="ms-auto" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="[{
            label: 'New chat',
            to: '/',
            kbds: ['meta', 'o'],
            icon: 'i-lucide-circle-plus'
          }, {
            label: 'Activity',
            to: '/leonardo-activity',
            icon: 'i-lucide-activity'
          }, {
            label: 'Library',
            to: '/library',
            icon: 'i-lucide-library-big',
            type: 'trigger',
            defaultOpen: true,
            children: [{
              label: 'Resume',
              to: '/api/library/resume/content',
              target: '_blank',
              rel: 'noopener noreferrer',
              external: true,
              icon: 'i-lucide-file-user'
            }, {
              label: 'Files',
              to: '/files',
              icon: 'i-lucide-files'
            }, {
              label: 'RAG Database',
              to: '/rag-database',
              icon: 'i-lucide-database'
            }]
          }]"
          :collapsed="collapsed"
          orientation="vertical"
        >
          <template #item-trailing="{ item }">
            <div v-if="item.kbds?.length" class="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
              <UKbd
                v-for="kbd in item.kbds"
                :key="kbd"
                :value="kbd"
                size="sm"
                variant="soft"
                class="bg-accented/50"
              />
            </div>
          </template>
        </UNavigationMenu>

        <UNavigationMenu
          v-if="loggedIn"
          :items="[{
            'label': 'Admin',
            'aria-label': 'Admin',
            'icon': 'i-lucide-shield',
            'type': 'trigger',
            'defaultOpen': true,
            'popover': { mode: 'click' },
            'children': [{
              label: 'Resume',
              to: '/admin/resume',
              icon: 'i-lucide-file-user'
            }, {
              label: 'RAG Document',
              to: '/admin/files',
              active: route.path === '/admin/files' || route.path.startsWith('/admin/task/'),
              icon: 'i-lucide-files'
            }, {
              label: 'Activities',
              to: '/admin/leonardo-activity',
              icon: 'i-lucide-activity'
            }]
          }]"
          :collapsed="collapsed"
          orientation="vertical"
        />

        <UNavigationMenu
          v-if="!collapsed"
          :items="items"
          :collapsed="collapsed"
          orientation="vertical"
          :ui="{
            link: 'overflow-hidden pr-7.5',
            linkTrailing: 'translate-x-full group-hover:translate-x-0 group-has-data-[state=open]:translate-x-0 transition-transform ms-0 absolute inset-e-px'
          }"
        >
          <template #chat-trailing="{ item }">
            <UDropdownMenu
              :items="getChatActions(item as { id: string, label: string })"
              :content="{ align: 'end' }"
            >
              <UButton
                as="div"
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="link"
                size="sm"
                class="rounded-[5px] hover:bg-accented/50 focus-visible:bg-accented/50 data-[state=open]:bg-accented/50"
                aria-label="Chat actions"
                tabindex="-1"
                @click.stop.prevent
              />
            </UDropdownMenu>
          </template>
        </UNavigationMenu>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu v-if="loggedIn" :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <div class="flex-1 flex m-4 lg:ml-0 rounded-lg ring ring-default bg-default/75 shadow-sm min-w-0 overflow-hidden">
      <slot />
    </div>
  </UDashboardGroup>
</template>
