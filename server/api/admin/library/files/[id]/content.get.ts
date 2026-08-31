import { db, schema } from 'hub:db'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'

type ParsedRange = {
  range: R2Range
  start: number
  end: number
}

function parseRangeHeader(value: string, size: number): ParsedRange | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return undefined

  if (!match[1]) {
    const suffix = Number.parseInt(match[2]!, 10)
    if (!Number.isInteger(suffix) || suffix < 1) return undefined
    const length = Math.min(suffix, size)
    return { range: { suffix: length }, start: size - length, end: size - 1 }
  }

  const start = Number.parseInt(match[1], 10)
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : size - 1
  const end = Math.min(requestedEnd, size - 1)
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start >= size || end < start) {
    return undefined
  }
  return { range: { offset: start, length: end - start + 1 }, start, end }
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/["\\\r\n]/g, '-').slice(0, 160)
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function setPdfSecurityHeaders(headers: Headers): void {
  headers.set('Content-Security-Policy', 'sandbox; default-src \'none\'; base-uri \'none\'; form-action \'none\'')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
}

export default defineEventHandler(async (event) => {
  await assertLibraryAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const upload = await db.query.uploads.findFirst({
    where: () => and(
      eq(schema.uploads.id, id),
      ne(schema.uploads.status, 'deleted')
    )
  })
  if (!upload) {
    throw createError({ statusCode: 404, statusMessage: 'Library file not found' })
  }

  const rangeHeader = getRequestHeader(event, 'range')
  const parsedRange = rangeHeader ? parseRangeHeader(rangeHeader, upload.sizeBytes) : undefined
  if (rangeHeader && !parsedRange) {
    setResponseHeader(event, 'Content-Range', `bytes */${upload.sizeBytes}`)
    throw createError({ statusCode: 416, statusMessage: 'Requested range is not satisfiable' })
  }

  const bucket = requireCloudflareBinding(event, 'BLOB')
  const object = await bucket.get(upload.r2Key, parsedRange ? { range: parsedRange.range } : undefined)
  if (!object) {
    throw createError({ statusCode: 404, statusMessage: 'Library object not found' })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', contentDisposition(upload.originalName))
  headers.set('ETag', object.httpEtag)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'private, no-store')
  setPdfSecurityHeaders(headers)
  if (parsedRange) {
    headers.set('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${upload.sizeBytes}`)
    headers.set('Content-Length', String(parsedRange.end - parsedRange.start + 1))
  } else {
    headers.set('Content-Length', String(upload.sizeBytes))
  }

  return new Response(object.body, {
    status: parsedRange ? 206 : 200,
    headers
  })
})
