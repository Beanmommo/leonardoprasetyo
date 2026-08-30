import { db, schema } from 'hub:db'
import { eq, sql } from 'drizzle-orm'

const MAX_PDF_BYTES = 10 * 1024 * 1024

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

function safePdfName(value: string | undefined): string {
  const lastSegment = value?.split(/[\\/]/).at(-1) || 'document.pdf'
  const sanitized = Array.from(lastSegment, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 || '"<>:|?*'.includes(character) ? '-' : character
  }).join('').trim().slice(0, 160)
  if (!sanitized) {
    return 'document.pdf'
  }
  return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)

  const contentType = (getRequestHeader(event, 'content-type') || '').split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/pdf') {
    throw createError({ statusCode: 415, statusMessage: 'Only application/pdf uploads are accepted' })
  }

  const declaredLength = getRequestHeader(event, 'content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_PDF_BYTES)) {
    throw createError({ statusCode: 413, statusMessage: 'The PDF must not exceed 10 MiB' })
  }

  const body = await readRawBody(event, false)
  if (!body || body.byteLength === 0) {
    throw createError({ statusCode: 400, statusMessage: 'A PDF request body is required' })
  }
  if (body.byteLength > MAX_PDF_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'The PDF must not exceed 10 MiB' })
  }

  const bytes = Uint8Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  if (!isPdf(bytes)) {
    throw createError({ statusCode: 400, statusMessage: 'The request body is not a valid PDF file' })
  }

  const filename = safePdfName(getRequestHeader(event, 'x-filename'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const checksumSha256 = toHex(digest)
  // Preserve the key of an existing content-addressed upload so a legacy
  // document is not orphaned merely because the API path was generalized.
  const existingUpload = await db.query.uploads.findFirst({
    where: () => eq(schema.uploads.checksumSha256, checksumSha256)
  })
  const r2Key = existingUpload?.r2Key || `library/public/documents/${checksumSha256}.pdf`
  const bucket = requireCloudflareBinding(event, 'BLOB')
  const previousObject = await bucket.head(r2Key)

  await bucket.put(r2Key, bytes, {
    sha256: digest,
    httpMetadata: {
      contentType: 'application/pdf',
      contentDisposition: `inline; filename="${filename}"`
    },
    customMetadata: {
      checksumSha256,
      originalName: filename,
      visibility: 'public'
    }
  })

  const now = new Date()
  const id = crypto.randomUUID()
  try {
    const [persisted] = await db.insert(schema.uploads).values({
      id,
      ownerId: 'library-admin',
      r2Key,
      originalName: filename,
      contentType: 'application/pdf',
      sizeBytes: body.byteLength,
      checksumSha256,
      status: 'uploaded',
      isPublic: true,
      isActive: false,
      pageCount: null,
      vectorMutationId: null,
      ingestionId: null,
      indexedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      errorMessage: null
    }).onConflictDoUpdate({
      target: schema.uploads.checksumSha256,
      set: {
        r2Key,
        originalName: filename,
        contentType: 'application/pdf',
        sizeBytes: body.byteLength,
        // Conflict expressions are evaluated against the row that currently
        // exists in D1. A concurrent ingestion may have changed its lifecycle
        // since this request started, so only a deleted row is revived.
        status: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN 'uploaded' ELSE ${schema.uploads.status} END`,
        isPublic: true,
        isActive: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN 0 ELSE ${schema.uploads.isActive} END`,
        pageCount: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN NULL ELSE ${schema.uploads.pageCount} END`,
        vectorMutationId: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN NULL ELSE ${schema.uploads.vectorMutationId} END`,
        ingestionId: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN NULL ELSE ${schema.uploads.ingestionId} END`,
        indexedAt: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN NULL ELSE ${schema.uploads.indexedAt} END`,
        deletedAt: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN NULL ELSE ${schema.uploads.deletedAt} END`,
        errorMessage: sql`CASE WHEN ${schema.uploads.status} = 'deleted' THEN NULL ELSE ${schema.uploads.errorMessage} END`,
        updatedAt: now
      }
    }).returning({
      id: schema.uploads.id,
      originalName: schema.uploads.originalName,
      checksumSha256: schema.uploads.checksumSha256,
      status: schema.uploads.status,
      sizeBytes: schema.uploads.sizeBytes
    })

    if (!persisted) {
      throw new Error('D1 did not return the persisted Library upload')
    }

    const alreadyExisted = persisted.id !== id
    setResponseStatus(event, alreadyExisted ? 200 : 201)
    return {
      file: persisted,
      alreadyExisted
    }
  } catch (error) {
    if (!previousObject) {
      try {
        const referenced = await db.query.uploads.findFirst({
          where: () => eq(schema.uploads.checksumSha256, checksumSha256)
        })
        if (!referenced) {
          await bucket.delete(r2Key)
        }
      } catch (cleanupError) {
        // Preserve a content-addressed object when ownership is uncertain. A
        // later maintenance pass can safely remove an unreferenced object.
        console.error(JSON.stringify({
          message: 'Could not verify whether an R2 Library upload was safe to roll back',
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }))
      }
    }
    throw error
  }
})
