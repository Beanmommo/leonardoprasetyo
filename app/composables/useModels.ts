import { MODELS } from '#shared/utils/models'

export function useModels() {
  const model = useCookie<string>('model', { default: () => '@cf/ibm-granite/granite-4.0-h-micro' })

  return {
    models: MODELS,
    model
  }
}
