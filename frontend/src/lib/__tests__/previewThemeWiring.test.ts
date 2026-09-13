/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('preview theme wiring', () => {
  it('PreviewChart receives theme from App and forwards it to buildPreviewConfig', () => {
    const preview = readFileSync(join(srcRoot, 'components/PreviewChart.tsx'), 'utf8')
    const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
    expect(preview).toMatch(/theme:\s*Theme/)
    expect(preview).toMatch(/buildPreviewConfig\([\s\S]*theme/)
    expect(app).toMatch(/<PreviewChart[\s\S]*theme=\{theme\}/)
  })
})
