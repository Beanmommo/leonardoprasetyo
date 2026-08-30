export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Server chat persistence is retired; votes are no longer stored remotely'
  })
})
