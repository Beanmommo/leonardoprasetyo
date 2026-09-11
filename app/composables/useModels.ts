import { MODELS } from '#shared/utils/models'

export function useModels() {
  const defaultModel = MODELS[0]!.value
  const model = useCookie<string>('model', { default: () => defaultModel })

  // Refresh saved selections when the server-controlled model changes.
  if (!MODELS.some(item => item.value === model.value)) {
    model.value = defaultModel
  }

  return {
    models: MODELS,
    model
  }
}
