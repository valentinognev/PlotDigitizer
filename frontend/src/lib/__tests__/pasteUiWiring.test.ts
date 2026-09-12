/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
const exportPanel = readFileSync(join(srcRoot, 'components/ExportPanel.tsx'), 'utf8')

describe('paste UI wiring', () => {
  it('imports handleClipboardPaste and installs a window paste listener', () => {
    expect(app).toMatch(/import \{ handleClipboardPaste \} from ['"]\.\/lib\/clipboardPaste['"]/)
    expect(app).toMatch(/window\.addEventListener\(\s*['"]paste['"]/)
    expect(app).toMatch(/window\.removeEventListener\(\s*['"]paste['"]/)
    expect(app).toMatch(
      /handleClipboardPaste\(\s*e,\s*\(file\)\s*=>\s*\{\s*void handleUpload\(file\)\s*\}\s*\)/,
    )
  })

  it('keeps the paste listener installed while busy and skips upload', () => {
    expect(app).toMatch(/if\s*\(\s*busy\s*\)\s*return/)
    expect(app).toMatch(/addEventListener\(\s*['"]paste['"][\s\S]*?\},\s*\[busy\]\s*\)/)
    expect(app).not.toMatch(/if\s*\(\s*!busy\s*\)[\s\S]{0,200}addEventListener\(\s*['"]paste['"]/)
  })

  it('adds a paste hover hint on the Upload image label', () => {
    expect(app).toContain('title="Or paste (Ctrl+V / Cmd+V)"')
    expect(app).toContain('Upload image')
  })
})

describe('ExportPanel empty state', () => {
  it('mentions paste as a way to start', () => {
    expect(exportPanel).toContain('Or upload or paste an image to start.')
    expect(exportPanel).not.toContain('Or upload an image to start.')
  })
})
