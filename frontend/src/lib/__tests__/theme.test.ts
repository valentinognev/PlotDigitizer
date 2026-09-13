import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  parseStoredTheme,
  persistTheme,
  readStoredTheme,
  setTheme,
} from '../theme'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value
    },
    data,
  }
}

describe('parseStoredTheme', () => {
  it('returns day only for the exact stored value day; otherwise night', () => {
    expect(parseStoredTheme('day')).toBe('day')
    expect(parseStoredTheme('night')).toBe('night')
    expect(parseStoredTheme(null)).toBe('night')
    expect(parseStoredTheme('')).toBe('night')
    expect(parseStoredTheme('light')).toBe('night')
    expect(parseStoredTheme('DAY')).toBe('night')
  })
})

describe('readStoredTheme', () => {
  it('defaults to night when the key is missing', () => {
    expect(readStoredTheme(memoryStorage())).toBe(DEFAULT_THEME)
    expect(DEFAULT_THEME).toBe('night')
  })

  it('reads a stored day preference', () => {
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'day' }))).toBe('day')
  })
})

describe('persistTheme / applyTheme / setTheme', () => {
  it('writes plotdigitizer.theme and sets data-theme on the root', () => {
    const storage = memoryStorage()
    const attrs: Record<string, string> = {}
    const root = {
      setAttribute: (name: string, value: string) => {
        attrs[name] = value
      },
    }
    persistTheme('day', storage)
    expect(storage.data[THEME_STORAGE_KEY]).toBe('day')
    applyTheme('night', root)
    expect(attrs['data-theme']).toBe('night')
    setTheme('day', root, storage)
    expect(storage.data[THEME_STORAGE_KEY]).toBe('day')
    expect(attrs['data-theme']).toBe('day')
  })
})
