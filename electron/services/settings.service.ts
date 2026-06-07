import Store from 'electron-store'
import type { AppSettings, TeachingMode } from '../../src/types'

interface StoreSchema {
  apiKey: string
  model: string
  defaultTeachingMode: TeachingMode
  darkMode: boolean
  visionApiKey: string
  visionBaseURL: string
  visionModel: string
}

const store = new Store<StoreSchema>({
  name: 'settings',
  encryptionKey: 'specula-local-key-v1',
  defaults: {
    apiKey: '',
    model: 'deepseek-chat',
    defaultTeachingMode: 'direct',
    darkMode: false,
    visionApiKey: '',
    visionBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    visionModel: 'qwen-vl-max',
  },
})

export function getSettings(): AppSettings {
  return {
    apiKey: store.get('apiKey'),
    model: store.get('model'),
    defaultTeachingMode: store.get('defaultTeachingMode'),
    darkMode: store.get('darkMode'),
    visionApiKey: store.get('visionApiKey'),
    visionBaseURL: store.get('visionBaseURL'),
    visionModel: store.get('visionModel'),
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  if (partial.apiKey !== undefined) store.set('apiKey', partial.apiKey)
  if (partial.model !== undefined) store.set('model', partial.model)
  if (partial.defaultTeachingMode !== undefined) store.set('defaultTeachingMode', partial.defaultTeachingMode)
  if (partial.darkMode !== undefined) store.set('darkMode', partial.darkMode)
  if (partial.visionApiKey !== undefined) store.set('visionApiKey', partial.visionApiKey)
  if (partial.visionBaseURL !== undefined) store.set('visionBaseURL', partial.visionBaseURL)
  if (partial.visionModel !== undefined) store.set('visionModel', partial.visionModel)
  return getSettings()
}

export function getVisionConfig(): { apiKey: string; baseURL: string; model: string } {
  return {
    apiKey: store.get('visionApiKey'),
    baseURL: store.get('visionBaseURL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: store.get('visionModel') || 'qwen-vl-max',
  }
}

export function getApiKey(): string {
  return store.get('apiKey')
}

export function getModel(): string {
  return store.get('model')
}

export function getDefaultTeachingMode(): TeachingMode {
  return store.get('defaultTeachingMode')
}
