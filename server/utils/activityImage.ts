import type { H3Event } from 'h3'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { ACTIVITY_IMAGE_UPLOAD_MAX_BYTES, normalizeActivityImage } from './activityImageProcessing'

export async function readActivitySubmission(event: H3Event) {
  const contentType = getRequestHeader(event, 'content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return { input: await readValidatedBody(event, leonardoActivityInputSchema.parse), image: undefined }
  }

  const parts = await readMultipartFormData(event)
  const data = parts?.filter(part => part.name === 'data')
  const images = parts?.filter(part => part.name === 'image')
  if (!parts || data?.length !== 1 || images?.length !== 1 || parts.length !== 2 || !data[0] || !images[0]) {
    throw createError({ statusCode: 400, statusMessage: 'Provide activity data and one cropped picture' })
  }
  if (data[0].data.byteLength > 640 * 1024 || images[0].data.byteLength > ACTIVITY_IMAGE_UPLOAD_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'The picture upload is too large. Please choose a smaller picture.' })
  }
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(data[0].data))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid activity data' })
  }
  const result = leonardoActivityInputSchema.safeParse(json)
  if (!result.success || result.data.removeImage) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid activity data' })
  }
  if (images[0].type !== 'image/jpeg') {
    throw createError({ statusCode: 400, statusMessage: 'The picture could not be read. Please choose it again and confirm the crop.' })
  }
  try {
    return { input: result.data, image: normalizeActivityImage(images[0].data) }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'The picture could not be processed. Please choose it again and confirm the crop.' })
  }
}

export async function uploadActivityImage(event: H3Event, id: string, image: Uint8Array<ArrayBuffer> | undefined) {
  if (!image) return undefined
  const imageKey = `activities/${id}/${crypto.randomUUID()}.jpg`
  await requireCloudflareBinding(event, 'BLOB').put(imageKey, image, {
    httpMetadata: { contentType: 'image/jpeg' }
  })
  return imageKey
}

export async function deleteUnusedActivityImage(event: H3Event, imageKey: string | null | undefined) {
  if (!imageKey) return
  try {
    // Also safe after an uncertain D1 response: never remove a referenced image.
    const referenced = await db.query.leonardoActivities.findFirst({
      where: eq(schema.leonardoActivities.imageKey, imageKey),
      columns: { id: true }
    })
    if (!referenced) await requireCloudflareBinding(event, 'BLOB').delete(imageKey)
  } catch (error) {
    console.error('Could not clean up an unused activity image', imageKey, error)
  }
}
