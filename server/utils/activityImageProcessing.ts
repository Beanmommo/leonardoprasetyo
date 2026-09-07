import jpeg from 'jpeg-js'
import { ACTIVITY_IMAGE_MAX_BYTES, ACTIVITY_IMAGE_QUALITY, ACTIVITY_IMAGE_SIZE } from '../../shared/utils/activityImage.ts'

// Tabs opened before avatar compression was introduced still submit 512px
// crops. Accept those inputs, while keeping every stored avatar small.
export const ACTIVITY_IMAGE_UPLOAD_MAX_BYTES = 1024 * 1024
const MAX_CROP_SIZE = 512

export function normalizeActivityImage(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!bytes.length || bytes.byteLength > ACTIVITY_IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error('Picture upload is too large or empty')
  }

  const source = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    tolerantDecoding: false,
    maxResolutionInMP: MAX_CROP_SIZE * MAX_CROP_SIZE / 1_000_000,
    maxMemoryUsageInMB: 16
  })
  if (source.width !== source.height || source.width > MAX_CROP_SIZE || source.width < 1) {
    throw new Error('A square cropped picture is required')
  }
  if (source.width <= ACTIVITY_IMAGE_SIZE && bytes.byteLength <= ACTIVITY_IMAGE_MAX_BYTES) {
    return Uint8Array.from(bytes)
  }

  const size = Math.min(source.width, ACTIVITY_IMAGE_SIZE)
  const data = new Uint8Array(size * size * 4)
  const scale = source.width / size

  // Average the source area covered by each output pixel to avoid aliasing
  // when shrinking the crop, and retain the crop the user already chose.
  for (let y = 0; y < size; y++) {
    const top = y * scale
    const bottom = (y + 1) * scale
    for (let x = 0; x < size; x++) {
      const left = x * scale
      const right = (x + 1) * scale
      const rgb = [0, 0, 0]
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
        const overlapY = Math.min(sy + 1, bottom) - Math.max(sy, top)
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const weight = overlapY * (Math.min(sx + 1, right) - Math.max(sx, left))
          const offset = (sy * source.width + sx) * 4
          for (let channel = 0; channel < 3; channel++) {
            rgb[channel] = (rgb[channel] ?? 0) + (source.data[offset + channel] ?? 0) * weight
          }
        }
      }
      const offset = (y * size + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.round((rgb[channel] ?? 0) / (scale * scale))
      }
      data[offset + 3] = 255
    }
  }

  const encoded = jpeg.encode({ data, width: size, height: size }, Math.round(ACTIVITY_IMAGE_QUALITY * 100))
  if (encoded.data.byteLength > ACTIVITY_IMAGE_MAX_BYTES) throw new Error('Could not compress the picture')
  return Uint8Array.from(encoded.data)
}
