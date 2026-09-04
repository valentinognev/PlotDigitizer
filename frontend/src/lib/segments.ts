export type SegmentLite = {
  index: number
  length: number
  points: [number, number][]
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function distToPolyline(pixel: [number, number], points: [number, number][]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY
  if (points.length === 1) {
    return Math.hypot(pixel[0] - points[0][0], pixel[1] - points[0][1])
  }
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(
      pixel[0],
      pixel[1],
      points[i][0],
      points[i][1],
      points[i + 1][0],
      points[i + 1][1],
    )
    if (d < best) best = d
  }
  return best
}

export function nearestSegment(
  segments: SegmentLite[],
  pixel: [number, number],
  maxDistance = 12,
): SegmentLite | null {
  let best: SegmentLite | null = null
  let bestD = maxDistance
  for (const seg of segments) {
    const d = distToPolyline(pixel, seg.points)
    if (d <= bestD) {
      bestD = d
      best = seg
    }
  }
  return best
}

export function flattenPolyline(points: [number, number][]): number[] {
  const out: number[] = []
  for (const [x, y] of points) {
    out.push(x, y)
  }
  return out
}

export function formatSeparation(px: number): string {
  return `${Math.round(px)} px`
}
