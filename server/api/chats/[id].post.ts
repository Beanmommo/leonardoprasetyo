export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'This AI route is retired; use the quota-protected POST /api/chat route'
  })
})
