import Store from 'electron-store'
import type { AppSettings, TeachingMode } from '../../src/types'

interface StoreSchema {
  apiKey: string
  model: string
  defaultTeachingMode: TeachingMode
  darkMode: boolean
}

const store = new Store<StoreSchema>({
  name: 'settings',
  encryptionKey: 'specula-local-key-v1',
  defaults: {
    apiKey: '',
    model: 'deepseek-chat',
    defaultTeachingMode: 'direct',
    darkMode: false,
  },
})

export function getSettings(): AppSettings {
  return {
    apiKey: store.get('apiKey'),
    model: store.get('model'),
    defaultTeachingMode: store.get('defaultTeachingMode'),
    darkMode: store.get('darkMode'),
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  if (partial.apiKey !== undefined) store.set('apiKey', partial.apiKey)
  if (partial.model !== undefined) store.set('model', partial.model)
  if (partial.defaultTeachingMode !== undefined) store.set('defaultTeachingMode', partial.defaultTeachingMode)
  if (partial.darkMode !== undefined) store.set('darkMode', partial.darkMode)
  return getSettings()
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
