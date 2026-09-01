import { db, schema } from 'hub:db'
import { and, eq, inArray, ne } from 'drizzle-orm'

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

  const uploadedBytes = Uint8Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  if (!isPdf(uploadedBytes)) {
    throw createError({ statusCode: 400, statusMessage: 'The request body is not a valid PDF file' })
  }

  const originalName = safeResumePdfName(getRequestHeader(event, 'x-filename'))
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = await normalizeResumePdfMetadata(uploadedBytes, originalName)
  } catch (error) {
    console.warn(JSON.stringify({
      message: 'Could not normalize uploaded resume PDF metadata',
      originalName,
      error: error instanceof Error ? error.message : String(error)
    }))
    throw createError({ statusCode: 400, statusMessage: 'The resume PDF could not be read' })
  }
  if (bytes.byteLength > MAX_RESUME_PDF_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'The normalized resume PDF must not exceed 10 MiB' })
  }

  const [uploadedDigest, digest] = await Promise.all([
    crypto.subtle.digest('SHA-256', uploadedBytes),
    crypto.subtle.digest('SHA-256', bytes)
  ])
  const uploadedChecksumSha256 = toHex(uploadedDigest)
  const checksumSha256 = toHex(digest)
  const candidateChecksums = uploadedChecksumSha256 === checksumSha256
    ? [checksumSha256]
    : [uploadedChecksumSha256, checksumSha256]
  const bucket = requireCloudflareBinding(event, 'BLOB')
  const [existingResume, checksumOwners] = await Promise.all([
    db.query.uploads.findFirst({
      where: () => and(
        eq(schema.uploads.role, 'resume'),
        ne(schema.uploads.status, 'deleted')
      )
    }),
    db.query.uploads.findMany({
      where: () => inArray(schema.uploads.checksumSha256, candidateChecksums)
    })
  ])

  const competingOwners = checksumOwners.filter(owner =>
    owner.id !== existingResume?.id && owner.status !== 'deleted'
  )
  if ((existingResume && competingOwners.length > 0)
    || (!existingResume && competingOwners.length > 1)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This PDF is still published as a Library document; delete that document before publishing it as the resume'
    })
  }

  // If no canonical resume exists yet, promoting a matching document preserves
  // its task history and lets ingestion remove its previous document vectors.
  const checksumOwner = checksumOwners.find(owner => owner.status !== 'deleted')
    || checksumOwners.find(owner => owner.checksumSha256 === uploadedChecksumSha256)
    || checksumOwners[0]
  const normalizedChecksumOwner = checksumOwners.find(owner => owner.checksumSha256 === checksumSha256)
  const targetUpload = existingResume || checksumOwner
  if (targetUpload) {
    const activeTask = await db.query.indexingTasks.findFirst({
      where: () => and(
        eq(schema.indexingTasks.uploadId, targetUpload.id),
        inArray(schema.indexingTasks.status, ['queued', 'processing'])
      )
    })
    if (activeTask) {
      throw createError({
        statusCode: 409,
        statusMessage: 'The resume already has an active indexing task'
      })
    }
  }

  const previousObject = await bucket.get(RESUME_R2_KEY)
  const previousBytes = previousObject
    ? Uint8Array.from(new Uint8Array(await previousObject.arrayBuffer()))
    : null
  const object = await bucket.put(RESUME_R2_KEY, bytes, {
    sha256: digest,
    httpMetadata: {
      contentType: 'application/pdf',
      contentDisposition: resumeContentDisposition(originalName)
    },
    customMetadata: {
      checksumSha256,
      originalName,
      pdfTitle: resumePdfTitle(originalName),
      visibility: 'public',
      purpose: 'resume-download'
    }
  })

  const now = new Date()
  let upload: typeof schema.uploads.$inferSelect | undefined
  try {
    if (targetUpload) {
      const updateResume = db.update(schema.uploads).set({
        ownerId: 'library-admin',
        r2Key: RESUME_R2_KEY,
        originalName,
        contentType: 'application/pdf',
        sizeBytes: bytes.byteLength,
        checksumSha256,
        role: 'resume',
        status: 'uploaded',
        errorMessage: null,
        isPublic: true,
        isActive: false,
        pageCount: null,
        deletedAt: null,
        updatedAt: now
      }).where(eq(schema.uploads.id, targetUpload.id))

      if (normalizedChecksumOwner
        && normalizedChecksumOwner.id !== targetUpload.id
        && normalizedChecksumOwner.status === 'deleted') {
        await db.batch([
          // Free the global checksum uniqueness slot retained by the soft-
          // deleted document before assigning these bytes to the resume.
          db.update(schema.uploads).set({
            checksumSha256: `${normalizedChecksumOwner.checksumSha256}:deleted:${normalizedChecksumOwner.id}`,
            updatedAt: now
          }).where(and(
            eq(schema.uploads.id, normalizedChecksumOwner.id),
            eq(schema.uploads.status, 'deleted')
          )),
          updateResume
        ])
        upload = await db.query.uploads.findFirst({
          where: () => eq(schema.uploads.id, targetUpload.id)
        })
      } else {
        [upload] = await updateResume.returning()
      }
    } else {
      [upload] = await db.insert(schema.uploads).values({
        id: crypto.randomUUID(),
        ownerId: 'library-admin',
        r2Key: RESUME_R2_KEY,
        originalName,
        contentType: 'application/pdf',
        sizeBytes: bytes.byteLength,
        checksumSha256,
        role: 'resume',
        status: 'uploaded',
        errorMessage: null,
        isPublic: true,
        isActive: false,
        createdAt: now,
        updatedAt: now
      }).returning()
    }
    if (!upload) {
      throw new Error('D1 did not return the persisted resume upload')
    }
  } catch (error) {
    try {
      if (previousObject && previousBytes) {
        await bucket.put(RESUME_R2_KEY, previousBytes, {
          httpMetadata: previousObject.httpMetadata,
          customMetadata: previousObject.customMetadata
        })
      } else {
        await bucket.delete(RESUME_R2_KEY)
      }
    } catch (rollbackError) {
      console.error(JSON.stringify({
        message: 'Could not restore the previous resume object after D1 persistence failed',
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      }))
    }
    throw error
  }

  if (targetUpload?.role === 'document' && targetUpload.r2Key !== RESUME_R2_KEY) {
    try {
      await bucket.delete(targetUpload.r2Key)
    } catch (error) {
      // The fixed resume object and D1 row are already authoritative. Leaving
      // an unreferenced content-addressed object is safer than rolling them back.
      console.error(JSON.stringify({
        message: 'Could not remove the superseded document object after promoting it to resume',
        r2Key: targetUpload.r2Key,
        error: error instanceof Error ? error.message : String(error)
      }))
    }
  }

  const task = await queueIndexingTask(event, upload.id)
  setResponseStatus(event, 202)
  return {
    resume: serializeStoredResume(object),
    task: serializeIndexingTask(task, originalName)
  }
})
