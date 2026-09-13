/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatCursorReadout, IDLE_CURSOR_READOUT } from '../cursorReadout'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const canvas = readFileSync(join(srcRoot, 'components/EditorCanvas.tsx'), 'utf8')
const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')

describe('formatCursorReadout', () => {
  it('shows pixel only when data is null', () => {
    expect(formatCursorReadout([12.4, 8.6], null, 'cartesian')).toBe('px 12.4, 8.6')
  })
  it('appends x,y for cartesian and theta/R for polar', () => {
    expect(formatCursorReadout([10, 20], [1.5, 2.25], 'cartesian')).toBe(
      'px 10.0, 20.0  ·  x 1.5  y 2.25',
    )
    expect(formatCursorReadout([10, 20], [45, 3], 'polar')).toBe(
      'px 10.0, 20.0  ·  θ 45  R 3',
    )
    expect(formatCursorReadout([10, 20], [5, 0], 'bar')).toBe(
      'px 10.0, 20.0  ·  value 5',
    )
  })
  it('keeps a non-empty idle string when there is no hover pixel', () => {
    expect(formatCursorReadout(null, null, 'cartesian')).toBe(IDLE_CURSOR_READOUT)
    expect(IDLE_CURSOR_READOUT.length).toBeGreaterThan(0)
  })
})

describe('cursor readout chrome stays mounted', () => {
  it('does not mount/unmount the readout row on hover', () => {
    expect(canvas).not.toMatch(/\{cursorReadout \?/)
    expect(canvas).toMatch(/whitespace-nowrap/)
    expect(canvas).toContain('{cursorReadout}')
  })
  it('always formats a readout string so the canvas height never depends on hover', () => {
    expect(app).toMatch(/formatCursorReadout\(\s*hoverPixel/)
    expect(app).not.toMatch(/const cursorReadout = hoverPixel\s*\?/)
  })
})
