export const THEME_STORAGE_KEY = 'plotdigitizer.theme'
export const DEFAULT_THEME = 'night'
export type Theme = 'night' | 'day'

export function parseStoredTheme(raw: string | null): Theme {
  return raw === 'day' ? 'day' : 'night'
}

export function readStoredTheme(storage: { getItem(key: string): string | null }): Theme {
  return parseStoredTheme(storage.getItem(THEME_STORAGE_KEY))
}

export function persistTheme(theme: Theme, storage: { setItem(key: string, value: string): void }): void {
  storage.setItem(THEME_STORAGE_KEY, theme)
}

export function applyTheme(theme: Theme, root: { setAttribute(name: string, value: string): void }): void {
  root.setAttribute('data-theme', theme)
}

export function setTheme(
  theme: Theme,
  root: { setAttribute(name: string, value: string): void },
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void },
): void {
  persistTheme(theme, storage)
  applyTheme(theme, root)
}
