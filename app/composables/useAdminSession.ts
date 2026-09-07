import type { AdminSession } from '#shared/types/admin'

export function useAdminSession() {
  return useFetch<AdminSession>('/api/admin/session', {
    key: 'admin-session',
    headers: { accept: 'application/json' }
  })
}
