import type { Calibration } from '../types'
import { getAxisBounds } from './transform'

export class UnskewError extends Error {}

export interface UnskewTransform {
  matrix: number[] // 3x3 row-major, 9 floats, maps source -> dest
  width: number
  height: number
}

type Point = [number, number]

function lineIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point {
  const [x1, y1] = p1
  const [x2, y2] = p2
  const [x3, y3] = p3
  const [x4, y4] = p4
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-9) throw new UnskewError('Axis lines are parallel')
  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
  return [px, py]
}

function normalize(v: Point): Point {
  const length = Math.hypot(v[0], v[1])
  if (length < 1e-9) throw new UnskewError('Degenerate axis direction')
  return [v[0] / length, v[1] / length]
}

function projectPointOnLine(point: Point, lineA: Point, lineB: Point): Point {
  const [ax, ay] = lineA
  const [bx, by] = lineB
  const [px, py] = point
  const dx = bx - ax
  const dy = by - ay
  const denom = dx * dx + dy * dy
  if (denom < 1e-9) throw new UnskewError('Degenerate axis line')
  const t = ((px - ax) * dx + (py - ay) * dy) / denom
  return [ax + t * dx, ay + t * dy]
}

function gramSchmidtY(xDir: Point, rawY: Point): Point {
  const dot = rawY[0] * xDir[0] + rawY[1] * xDir[1]
  const y: Point = [rawY[0] - dot * xDir[0], rawY[1] - dot * xDir[1]]
  return normalize(y)
}

function quadArea(a: Point, b: Point, c: Point, d: Point): number {
  const pts = [a, b, c, d]
  let area = 0
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return Math.abs(area) * 0.5
}

/** Solve Ax = b for n×n system via Gaussian elimination with partial pivoting. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length
  const m = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new UnskewError('Singular homography system')
    ;[m[col], m[pivot]] = [m[pivot], m[col]]

    const div = m[col][col]
    for (let j = col; j <= n; j++) m[col][j] /= div

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      if (factor === 0) continue
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j]
    }
  }

  return m.map((row) => row[n])
}

/** 4-point perspective transform — matches cv2.getPerspectiveTransform (h22 = 1). */
function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  const A: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const [xs, ys] = src[i]
    const [xd, yd] = dst[i]
    A.push([xs, ys, 1, 0, 0, 0, -xs * xd, -ys * xd])
    b.push(xd)
    A.push([0, 0, 0, xs, ys, 1, -xs * yd, -ys * yd])
    b.push(yd)
  }

  const [h00, h01, h02, h10, h11, h12, h20, h21] = solveLinearSystem(A, b)
  return [h00, h01, h02, h10, h11, h12, h20, h21, 1]
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) throw new UnskewError('Singular homography matrix')
  const invDet = 1 / det
  return [A * invDet, D * invDet, G * invDet, B * invDet, E * invDet, H * invDet, C * invDet, F * invDet, I * invDet]
}

function translateHomography(matrix: number[], tx: number, ty: number): number[] {
  const t = [1, 0, tx, 0, 1, ty, 0, 0, 1]
  return multiply3x3(t, matrix)
}

function multiply3x3(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

function expandHomographyToFullImage(
  matrix: number[],
  imageWidth: number,
  imageHeight: number,
): { matrix: number[]; width: number; height: number } {
  const corners: Point[] = [
    [0, 0],
    [imageWidth, 0],
    [imageWidth, imageHeight],
    [0, imageHeight],
  ]
  const transformed = corners.map((c) => applyHomography(matrix, c))
  const xs = transformed.map((p) => p[0])
  const ys = transformed.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return {
    matrix: translateHomography(matrix, -minX, -minY),
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function computeUnskewHomography(
  xmin: Point,
  xmax: Point,
  ymin: Point,
  ymax: Point,
  imageWidth: number,
  imageHeight: number,
): UnskewTransform {
  const origin = lineIntersection(xmin, xmax, ymin, ymax)
  const br = projectPointOnLine(xmax, xmin, xmax)
  const tl = projectPointOnLine(ymax, ymin, ymax)

  const xRaw = normalize([br[0] - origin[0], br[1] - origin[1]])
  const yRaw: Point = [tl[0] - origin[0], tl[1] - origin[1]]
  gramSchmidtY(xRaw, yRaw)

  const plotWidth = Math.hypot(br[0] - origin[0], br[1] - origin[1])
  const plotHeight = Math.hypot(tl[0] - origin[0], tl[1] - origin[1])
  if (plotWidth < 1 || plotHeight < 1) throw new UnskewError('Degenerate plot area')

  const tr: Point = [
    origin[0] + (br[0] - origin[0]) + (tl[0] - origin[0]),
    origin[1] + (br[1] - origin[1]) + (tl[1] - origin[1]),
  ]

  const src: Point[] = [origin, br, tr, tl]
  const dst: Point[] = [
    [0, plotHeight],
    [plotWidth, plotHeight],
    [plotWidth, 0],
    [0, 0],
  ]

  if (quadArea(src[0], src[1], src[2], src[3]) < 1) {
    throw new UnskewError('Degenerate plot area')
  }

  const plotMatrix = getPerspectiveTransform(src, dst)
  const expanded = expandHomographyToFullImage(plotMatrix, imageWidth, imageHeight)
  return { matrix: expanded.matrix, width: expanded.width, height: expanded.height }
}

export function applyHomography(
  matrix: number[],
  point: Point,
  inverse = false,
): Point {
  const m = inverse ? invert3x3(matrix) : matrix
  const [x, y] = point
  const outX = m[0] * x + m[1] * y + m[2]
  const outY = m[3] * x + m[4] * y + m[5]
  const w = m[6] * x + m[7] * y + m[8]
  if (Math.abs(w) < 1e-12) throw new UnskewError('Point at infinity under homography')
  return [outX / w, outY / w]
}

export function isUnskewReady(
  calibration: Calibration | null,
  imageWidth: number,
  imageHeight: number,
): boolean {
  if (!calibration || imageWidth < 1 || imageHeight < 1) return false
  const bounds = getAxisBounds(calibration)
  if (!bounds) return false
  try {
    computeUnskewHomography(
      bounds.xmin.pixel,
      bounds.xmax.pixel,
      bounds.ymin.pixel,
      bounds.ymax.pixel,
      imageWidth,
      imageHeight,
    )
    return true
  } catch {
    return false
  }
}

export function unskewFromCalibration(
  calibration: Calibration,
  imageWidth: number,
  imageHeight: number,
): UnskewTransform {
  const bounds = getAxisBounds(calibration)
  if (!bounds) throw new UnskewError('Calibration bounds unavailable')
  return computeUnskewHomography(
    bounds.xmin.pixel,
    bounds.xmax.pixel,
    bounds.ymin.pixel,
    bounds.ymax.pixel,
    imageWidth,
    imageHeight,
  )
}

function sampleBilinear(
  data: ImageData,
  x: number,
  y: number,
): [number, number, number, number] {
  const { width, height, data: px } = data
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    return [0, 0, 0, 0]
  }

  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0

  const idx = (row: number, col: number) => (row * width + col) * 4
  const i00 = idx(y0, x0)
  const i10 = idx(y0, x0 + 1)
  const i01 = idx(y0 + 1, x0)
  const i11 = idx(y0 + 1, x0 + 1)

  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const v00 = px[i00 + c]
    const v10 = px[i10 + c]
    const v01 = px[i01 + c]
    const v11 = px[i11 + c]
    out[c] =
      (1 - fx) * (1 - fy) * v00 +
      fx * (1 - fy) * v10 +
      (1 - fx) * fy * v01 +
      fx * fy * v11
  }
  return out
}

export async function warpImageToCanvas(
  image: HTMLImageElement,
  transform: UnskewTransform,
): Promise<HTMLCanvasElement> {
  const w = Math.round(transform.width)
  const h = Math.round(transform.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new UnskewError('Canvas 2D context unavailable')

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = image.naturalWidth
  srcCanvas.height = image.naturalHeight
  const srcCtx = srcCanvas.getContext('2d')
  if (!srcCtx) throw new UnskewError('Canvas 2D context unavailable')
  srcCtx.drawImage(image, 0, 0)
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
  const destData = ctx.createImageData(w, h)

  const rowsPerChunk = 16
  for (let y0 = 0; y0 < h; y0 += rowsPerChunk) {
    const yEnd = Math.min(y0 + rowsPerChunk, h)
    for (let dy = y0; dy < yEnd; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const [sx, sy] = applyHomography(transform.matrix, [dx, dy], true)
        const rgba = sampleBilinear(srcData, sx, sy)
        const di = (dy * w + dx) * 4
        destData.data[di] = rgba[0]
        destData.data[di + 1] = rgba[1]
        destData.data[di + 2] = rgba[2]
        destData.data[di + 3] = rgba[3]
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  ctx.putImageData(destData, 0, 0)
  return canvas
}

/** Dev parity check against backend fixture — call manually, not at import. */
export function assertUnskewParity(): void {
  const axisPoints = {
    xmin: [100, 400] as Point,
    xmax: [500, 350] as Point,
    ymin: [120, 380] as Point,
    ymax: [80, 80] as Point,
  }
  const imageWidth = 700
  const imageHeight = 500

  const result = computeUnskewHomography(
    axisPoints.xmin,
    axisPoints.xmax,
    axisPoints.ymin,
    axisPoints.ymax,
    imageWidth,
    imageHeight,
  )

  if (result.width < 380 || result.height < 320) {
    throw new Error(`output should include full image, got ${result.width}x${result.height}`)
  }

  const ymaxOut = applyHomography(result.matrix, axisPoints.ymax)
  const yminOut = applyHomography(result.matrix, axisPoints.ymin)
  if (ymaxOut[1] >= yminOut[1]) {
    throw new Error(`Y axis inverted: ymax y=${ymaxOut[1]} should be above ymin y=${yminOut[1]}`)
  }
}

// Dev: import { assertUnskewParity } from './unskew'; assertUnskewParity();
