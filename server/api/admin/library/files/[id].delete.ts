import { z } from 'zod'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  await assertLibraryAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)

  try {
    return { deletion: await deleteDocument(event, id) }
  } catch (error) {
    if (typeof error === 'object'
      && error !== null
      && 'statusCode' in error
      && typeof error.statusCode === 'number') {
      throw error
    }
    console.error(JSON.stringify({
      message: 'Document deletion failed',
      uploadId: id,
      error: error instanceof Error ? error.message : String(error)
    }))
    throw createError({ statusCode: 500, statusMessage: 'Document deletion failed' })
  }
})
