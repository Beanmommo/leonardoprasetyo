export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Chat uploads are retired; only the protected resume publisher can write to R2'
  })
})
