export default defineEventHandler(async (event) => {
  const bucket = getCloudflareBindings(event).BLOB
  if (!bucket) {
    return sendRedirect(event, RESUME_FALLBACK_URL, 307)
  }

  const object = await bucket.get(RESUME_R2_KEY)

  if (!object) {
    return sendRedirect(event, RESUME_FALLBACK_URL, 307)
  }

  const originalName = safeResumePdfName(object.customMetadata?.originalName)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', resumeContentDisposition(originalName))
  headers.set('Content-Length', String(object.size))
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')

  if (getRequestHeader(event, 'if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(object.body, { headers })
})
