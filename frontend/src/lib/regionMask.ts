import type { CanvasMode, RegionBox, RegionMask } from '../types'

const EMPTY: RegionMask = { boxes: [], strokes: [], erase_strokes: [] }

export function isMaskCanvasMode(
  mode: CanvasMode,
): mode is 'mask-box' | 'mask-pen' | 'mask-erase' {
  return mode === 'mask-box' || mode === 'mask-pen' || mode === 'mask-erase'
}

export function boxFromDrag(start: [number, number], end: [number, number]): RegionBox {
  const x = Math.min(start[0], end[0])
  const y = Math.min(start[1], end[1])
  return {
    x,
    y,
    w: Math.abs(end[0] - start[0]),
    h: Math.abs(end[1] - start[1]),
  }
}

function copyRegion(region: RegionMask | null | undefined): RegionMask {
  return {
    boxes: [...(region?.boxes ?? [])],
    strokes: (region?.strokes ?? []).map((s) => [...s]),
    erase_strokes: (region?.erase_strokes ?? []).map((s) => [...s]),
    ...(region?.stroke_width !== undefined ? { stroke_width: region.stroke_width } : {}),
  }
}

export function addBox(region: RegionMask | null | undefined, box: RegionBox): RegionMask {
  const next = copyRegion(region)
  next.boxes = [...next.boxes!, box]
  return next
}

export function pushPointToLastStroke(
  region: RegionMask | null | undefined,
  mode: 'pen' | 'erase',
  pixel: [number, number],
): RegionMask {
  const next = copyRegion(region)
  const key = mode === 'erase' ? 'erase_strokes' : 'strokes'
  const strokes = [...(next[key] ?? [])]
  const last = strokes[strokes.length - 1]
  if (!last) {
    strokes.push([pixel])
  } else {
    strokes[strokes.length - 1] = [...last, pixel]
  }
  next[key] = strokes
  return next
}

/** Pointer-down: open a new polyline so the next pushPointToLastStroke does not join the previous stroke. */
export function beginStroke(
  region: RegionMask | null | undefined,
  mode: 'pen' | 'erase',
): RegionMask {
  const next = copyRegion(region)
  const key = mode === 'erase' ? 'erase_strokes' : 'strokes'
  next[key] = [...(next[key] ?? []), []]
  return next
}

export function clear(_region?: RegionMask | null): RegionMask {
  return { ...EMPTY }
}
