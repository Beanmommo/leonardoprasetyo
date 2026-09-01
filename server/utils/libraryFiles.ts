import type { schema } from 'hub:db'

type UploadRow = typeof schema.uploads.$inferSelect

export type LibraryFile = {
  id: string
  originalName: string
  contentType: string
  sizeBytes: number
  checksumSha256: string
  role: UploadRow['role']
  status: UploadRow['status']
  pageCount: number | null
  chunkCount: number
  indexedAt: string | null
  createdAt: string
  updatedAt: string
  contentUrl: string
  r2: {
    key: string
    sizeBytes: number
    etag: string
    uploadedAt: string
  } | null
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

export function serializeLibraryFile(upload: UploadRow, object: R2Object | null, chunkCount: number): LibraryFile {
  return {
    id: upload.id,
    originalName: upload.originalName,
    contentType: upload.contentType,
    sizeBytes: upload.sizeBytes,
    checksumSha256: upload.checksumSha256,
    role: upload.role,
    status: upload.status,
    pageCount: upload.pageCount,
    chunkCount,
    indexedAt: dateToIso(upload.indexedAt),
    createdAt: upload.createdAt.toISOString(),
    updatedAt: upload.updatedAt.toISOString(),
    contentUrl: upload.role === 'resume'
      ? '/api/library/resume/content'
      : `/api/library/files/${upload.id}/content`,
    r2: object
      ? {
          key: object.key,
          sizeBytes: object.size,
          etag: object.httpEtag,
          uploadedAt: object.uploaded.toISOString()
        }
      : null
  }
}
