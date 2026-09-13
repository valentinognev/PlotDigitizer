/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
const switchSrc = readFileSync(join(srcRoot, 'components/ThemeSwitch.tsx'), 'utf8')

describe('ThemeSwitch', () => {
  it('is a Night|Day segmented control with aria-pressed', () => {
    expect(switchSrc).toContain("aria-label=\"Color theme\"")
    expect(switchSrc).toContain('Night')
    expect(switchSrc).toContain('Day')
    expect(switchSrc).toContain('aria-pressed')
  })
})

describe('header theme switch wiring', () => {
  it('imports ThemeSwitch and places it in the header', () => {
    expect(app).toMatch(/import \{ ThemeSwitch \} from ['"]\.\/components\/ThemeSwitch['"]/)
    expect(app).toContain('readStoredTheme')
    expect(app).toContain('setTheme')
    const header = app.slice(app.indexOf('<header'), app.indexOf('</header>'))
    expect(header).toContain('<ThemeSwitch')
    expect(header.indexOf('<ThemeSwitch')).toBeLessThan(header.indexOf('Upload image'))
  })
})
