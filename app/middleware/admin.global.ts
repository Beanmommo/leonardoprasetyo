export default defineNuxtRouteMiddleware((to) => {
  const isSignInPage = to.path === '/admin' || to.path === '/admin/'
  if (!isSignInPage && !to.path.startsWith('/admin/')) return

  const { loggedIn } = useUserSession()

  if (isSignInPage && loggedIn.value) {
    return navigateTo('/admin/files', { replace: true })
  }

  if (!isSignInPage && !loggedIn.value) {
    return navigateTo('/admin', { replace: true })
  }
})
