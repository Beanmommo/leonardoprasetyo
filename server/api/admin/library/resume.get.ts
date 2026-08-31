export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const bucket = requireCloudflareBinding(event, 'BLOB')
  const object = await bucket.head(RESUME_R2_KEY)

  return {
    resume: object ? serializeStoredResume(object) : null,
    fallbackUrl: RESUME_FALLBACK_URL
  }
})
