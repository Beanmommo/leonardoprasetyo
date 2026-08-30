export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Server chat persistence is retired; manage chats in browser storage'
  })
})
