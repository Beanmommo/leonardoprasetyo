export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const contentType = (getRequestHeader(event, 'content-type') || '').split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/pdf') {
    throw createError({ statusCode: 415, statusMessage: 'Only application/pdf resume uploads are accepted' })
  }

  const declaredLength = getRequestHeader(event, 'content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESUME_PDF_BYTES)) {
    throw createError({ statusCode: 413, statusMessage: 'The resume PDF must not exceed 10 MiB' })
  }

  const body = await readRawBody(event, false)
  if (!body || body.byteLength === 0) {
    throw createError({ statusCode: 400, statusMessage: 'A resume PDF request body is required' })
  }
  if (body.byteLength > MAX_RESUME_PDF_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'The resume PDF must not exceed 10 MiB' })
  }

  const bytes = Uint8Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  if (!isPdf(bytes)) {
    throw createError({ statusCode: 400, statusMessage: 'The request body is not a valid PDF file' })
  }

  const originalName = safeResumePdfName(getRequestHeader(event, 'x-filename'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const checksumSha256 = toHex(digest)
  const bucket = requireCloudflareBinding(event, 'BLOB')
  const object = await bucket.put(RESUME_R2_KEY, bytes, {
    sha256: digest,
    httpMetadata: {
      contentType: 'application/pdf',
      contentDisposition: resumeContentDisposition(originalName)
    },
    customMetadata: {
      checksumSha256,
      originalName,
      visibility: 'public',
      purpose: 'resume-download'
    }
  })

  return { resume: serializeStoredResume(object) }
})
