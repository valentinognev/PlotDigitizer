import type { CoordsType } from '../types'

export const IDLE_CURSOR_READOUT = 'px —, —'

function fmt(n: number): string {
  return String(Number(n.toPrecision(6)))
}

export function formatCursorReadout(
  pixel: [number, number] | null,
  data: [number, number] | null,
  coords: CoordsType | undefined,
): string {
  if (!pixel) return IDLE_CURSOR_READOUT
  const px = `px ${pixel[0].toFixed(1)}, ${pixel[1].toFixed(1)}`
  if (data === null) return px
  const a = fmt(data[0])
  const b = fmt(data[1])
  if (coords === 'polar') return `${px}  ·  θ ${a}  R ${b}`
  if (coords === 'bar') return `${px}  ·  value ${a}`
  return `${px}  ·  x ${a}  y ${b}`
}
