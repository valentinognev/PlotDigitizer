/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hoverPixelFromClient, magnifierSourceRect } from '../magnifier'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const canvas = readFileSync(join(srcRoot, 'components/EditorCanvas.tsx'), 'utf8')

describe('magnifierSourceRect', () => {
  it('is magnification-scaled and centred on the cursor, clamped to the image', () => {
    const r = magnifierSourceRect(200, 100, [100, 50], 5, 160)
    expect(r.sw).toBeCloseTo(32, 5)
    expect(r.sh).toBeCloseTo(32, 5)
    expect(r.sx).toBeCloseTo(84, 5)
    expect(r.sy).toBeCloseTo(34, 5)
  })
  it('clamps so the rect stays inside the image', () => {
    const r = magnifierSourceRect(40, 40, [0, 0], 5, 160)
    expect(r.sx).toBe(0)
    expect(r.sy).toBe(0)
    expect(r.sx + r.sw).toBeLessThanOrEqual(40)
    expect(r.sy + r.sh).toBeLessThanOrEqual(40)
  })
})

describe('hoverPixelFromClient', () => {
  const identity = (layer: [number, number]) => layer

  it('maps a client point through pan and zoom into image pixels', () => {
    expect(
      hoverPixelFromClient(150, 80, { left: 10, top: 20 }, { x: 40, y: 10 }, 2, identity),
    ).toEqual([50, 25])
  })

  it('applies toOriginal after converting to layer coordinates', () => {
    const toOriginal = ([x, y]: [number, number]): [number, number] => [x + 1, y + 2]
    expect(
      hoverPixelFromClient(110, 60, { left: 10, top: 20 }, { x: 0, y: 0 }, 1, toOriginal),
    ).toEqual([101, 42])
  })
})

describe('magnifier follows pointer during object drag', () => {
  it('syncs hover from DOM pointermove so Konva drag does not freeze the crop', () => {
    expect(canvas).toMatch(/hoverPixelFromClient/)
    expect(canvas).toMatch(/onPointerMove/)
  })

  it('does not clear hover on leave while a mouse button is down', () => {
    expect(canvas).not.toMatch(/onMouseLeave=\{\(\)\s*=>\s*onHoverPixel\(null\)\}/)
    expect(canvas).toMatch(/onPointerLeave|onMouseLeave/)
    expect(canvas).toMatch(/buttons/)
  })

  it('snaps the dragged node to the pointer so the magnifier centre is the object centre', () => {
    expect(canvas).toMatch(/alignObjectDrag/)
    expect(canvas).toMatch(/e\.target\.position\(\{\s*x: layer\[0\],\s*y: layer\[1\]/)
    expect(canvas).toMatch(/onHoverPixel\(toOriginalCoords\(layer\)\)/)
  })

  it('does not let container pointermove override hover during an object drag', () => {
    expect(canvas).toMatch(/objectDragRef/)
    expect(canvas).toMatch(/if \(objectDragRef\.current\) return/)
  })
})
