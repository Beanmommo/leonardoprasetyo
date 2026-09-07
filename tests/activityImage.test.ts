import assert from 'node:assert/strict'
import { test } from 'node:test'
import jpeg from 'jpeg-js'
import { normalizeActivityImage, ACTIVITY_IMAGE_UPLOAD_MAX_BYTES } from '../server/utils/activityImageProcessing.ts'
import { ACTIVITY_IMAGE_MAX_BYTES } from '../shared/utils/activityImage.ts'

function makeCrop(width: number, height = width) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      data[offset] = x < width / 2 ? 240 : 10
      data[offset + 1] = 20
      data[offset + 2] = x < width / 2 ? 10 : 240
      data[offset + 3] = 255
    }
  }
  return jpeg.encode({ data, width, height }, 90).data
}

test('older tabs can submit 512px crops and receive compressed 128px avatars', () => {
  const result = normalizeActivityImage(makeCrop(512))
  const decoded = jpeg.decode(result, { useTArray: true })
  assert.equal(decoded.width, 128)
  assert.equal(decoded.height, 128)
  assert.ok(result.byteLength <= ACTIVITY_IMAGE_MAX_BYTES)
  // Preserve the selected crop's red left side and blue right side.
  const left = (64 * 128 + 32) * 4
  const right = (64 * 128 + 96) * 4
  assert.ok(decoded.data[left]! > 200 && decoded.data[left + 2]! < 40)
  assert.ok(decoded.data[right]! < 40 && decoded.data[right + 2]! > 200)
})

test('current 128px crops retain their original bytes without recompression', () => {
  const input = makeCrop(128)
  assert.deepEqual(normalizeActivityImage(input), Uint8Array.from(input))
})

test('small crops are not upscaled', () => {
  const result = jpeg.decode(normalizeActivityImage(makeCrop(64)))
  assert.equal(result.width, 64)
  assert.equal(result.height, 64)
})

test('non-square crops, excessive dimensions, and excessive upload sizes are rejected', () => {
  assert.throws(() => normalizeActivityImage(makeCrop(128, 64)))
  assert.throws(() => normalizeActivityImage(makeCrop(513)))
  assert.throws(() => normalizeActivityImage(new Uint8Array(ACTIVITY_IMAGE_UPLOAD_MAX_BYTES + 1)))
})

test('corrupt JPEGs are rejected even when their frame header declares 128px', () => {
  const truncated = makeCrop(128).subarray(0, 600)
  assert.throws(() => normalizeActivityImage(truncated))
})
