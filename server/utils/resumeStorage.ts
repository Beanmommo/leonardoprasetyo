export const RESUME_R2_KEY = 'library/public/resume/current.pdf'
export const RESUME_FALLBACK_URL = '/leonardo-prasetyo-resume.pdf'
export const RESUME_DOWNLOAD_URL = '/api/library/resume/content'
export const MAX_RESUME_PDF_BYTES = 10 * 1024 * 1024

export type StoredResume = {
  originalName: string
  sizeBytes: number
  checksumSha256: string | null
  etag: string
  uploadedAt: string
  downloadUrl: string
}

export function safeResumePdfName(value: string | undefined): string {
  let decodedValue = value
  if (value) {
    try {
      decodedValue = decodeURIComponent(value)
    } catch {
      decodedValue = value
    }
  }

  const lastSegment = decodedValue?.split(/[\\/]/).at(-1) || 'leonardo-prasetyo-resume.pdf'
  const sanitized = Array.from(lastSegment, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 || '"<>:|?*'.includes(character) ? '-' : character
  }).join('').trim().slice(0, 160)

  if (!sanitized) return 'leonardo-prasetyo-resume.pdf'
  return sanitized.toLowerCase().endsWith('.pdf') ? sanitized : `${sanitized}.pdf`
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function resumeContentDisposition(filename: string): string {
  const fallback = filename.replace(/["\\\r\n]/g, '-').slice(0, 160)
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export function serializeStoredResume(object: R2Object): StoredResume {
  return {
    originalName: safeResumePdfName(object.customMetadata?.originalName),
    sizeBytes: object.size,
    checksumSha256: object.customMetadata?.checksumSha256 || null,
    etag: object.httpEtag,
    uploadedAt: object.uploaded.toISOString(),
    downloadUrl: RESUME_DOWNLOAD_URL
  }
}
