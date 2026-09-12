/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
const panel = readFileSync(join(srcRoot, 'components/AutoDigitizePanel.tsx'), 'utf8')
const canvas = readFileSync(join(srcRoot, 'components/EditorCanvas.tsx'), 'utf8')
const schemas = readFileSync(join(srcRoot, '../../backend/app/models/schemas.py'), 'utf8')

describe('AutoDigitize region + extract controls', () => {
  it('exposes Box / Pen / Erase / Clear region and extract actions', () => {
    expect(panel).toContain('Clear region')
    expect(panel).toContain('Averaging window')
    expect(panel).toContain('Sample Δx')
    expect(panel).toMatch(/>Box</)
    expect(panel).toMatch(/>Pen</)
    expect(panel).toMatch(/>Erase</)
    expect(panel).toContain('ΔX')
    expect(panel).toContain('ΔY')
    expect(panel).toContain('xmin')
    expect(panel).toContain('xmax')
    expect(panel).toContain('delx')
  })
})

describe('mask canvas wiring', () => {
  it('keeps CanvasMode unions aligned and refreshes the mask after region PATCH', () => {
    expect(app).toContain("'mask-box'")
    expect(app).toContain("'mask-pen'")
    expect(app).toContain("'mask-erase'")
    expect(app).toContain('patchCurveRegion')
    expect(app).toContain('runAveragingWindow')
    expect(app).toContain('sampleXStep')
    expect(app).toMatch(/patchCurveRegion\([\s\S]*?setMaskEpoch/)
    expect(canvas).toContain('mask-box')
    expect(canvas).toContain('mask-pen')
    expect(canvas).toContain('mask-erase')
    expect(canvas).toContain('onAddRegionBox')
    expect(canvas).toContain('onAddRegionStroke')
    expect(schemas).toContain('"mask-box"')
    expect(schemas).toContain('"mask-pen"')
    expect(schemas).toContain('"mask-erase"')
  })
})
