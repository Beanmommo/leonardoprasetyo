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
  const expectedTitle = resumePdfTitle(originalName)
  let responseBody: BodyInit = object.body
  let responseLength = object.size
  let responseEtag = object.httpEtag

  // Objects uploaded before resume metadata normalization still have the
  // previous filename in PDF /Title. Rewrite only those legacy responses;
  // newly uploaded objects retain R2 streaming without PDF parsing.
  if (object.customMetadata?.pdfTitle !== expectedTitle) {
    try {
      const bytes = Uint8Array.from(new Uint8Array(await object.arrayBuffer()))
      const normalizedBytes = await normalizeResumePdfMetadata(bytes, originalName)
      const digest = await crypto.subtle.digest('SHA-256', normalizedBytes)
      responseBody = normalizedBytes
      responseLength = normalizedBytes.byteLength
      responseEtag = `"${toHex(digest)}"`
    } catch (error) {
      console.warn(JSON.stringify({
        message: 'Could not normalize legacy resume PDF metadata while serving it',
        originalName,
        error: error instanceof Error ? error.message : String(error)
      }))
      const fallbackObject = await bucket.get(RESUME_R2_KEY)
      if (!fallbackObject) {
        return sendRedirect(event, RESUME_FALLBACK_URL, 307)
      }
      responseBody = fallbackObject.body
    }
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', resumeContentDisposition(originalName))
  headers.set('Content-Length', String(responseLength))
  headers.set('ETag', responseEtag)
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')

  if (getRequestHeader(event, 'if-none-match') === responseEtag) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(responseBody, { headers })
})
