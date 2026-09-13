/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '../theme'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8')
const indexCss = readFileSync(join(root, 'src/index.css'), 'utf8')

describe('theme boot', () => {
  it('defaults html to night and applies stored day before paint', () => {
    expect(indexHtml).toMatch(/<html[^>]*data-theme="night"/)
    expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`)
    expect(indexHtml).toContain("t === 'day'")
    expect(indexHtml).toContain("setAttribute('data-theme', 'day')")
  })
})

describe('day skin css', () => {
  it('drives body from skin tokens and remaps slate under html[data-theme=day]', () => {
    expect(indexCss).toContain('background: var(--app-bg')
    expect(indexCss).toContain('color: var(--app-fg')
    expect(indexCss).toMatch(/html\[data-theme=['"]day['"]\]/)
    expect(indexCss).toContain('--color-slate-900:')
    expect(indexCss).toContain('--app-bg: #f8fafc')
    expect(indexCss).toContain('--app-fg: #0f172a')
  })
})
