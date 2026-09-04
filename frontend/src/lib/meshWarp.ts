import type { Calibration } from '../types'
import { areCalibrationPixelsInImage, getAxisBounds, type AxisBoundKey } from './transform'
import {
  UnskewError,
  applyHomography,
  buildSourceImageData,
  computeQuadToQuadHomography,
  computeUnskewHomography,
  warpImageToCanvas,
  type UnskewTransform,
} from './unskew'

export { UnskewError }

export type Point = [number, number]
export type UnskewMode = 'perspective' | 'mesh'

export const DEFAULT_MESH_SECTIONS = 3
export const MIN_MESH_SECTIONS = 2
export const MAX_MESH_SECTIONS = 8

export interface MeshVertex {
  position: Point
  /** Tangent along increasing column (→). Present on top/bottom boundary and corners. */
  tangentH?: Point
  /** Tangent along increasing row (↓). Present on left/right boundary and corners. */
  tangentV?: Point
}

export interface MeshGridState {
  /** Number of mesh cells along each axis (grid vertices = sections + 1). */
  sections: number
  rows: number
  cols: number
  /** Boundary vertices only; interior is derived via Coons interpolation. */
  vertices: MeshVertex[][]
}

export interface MeshWarpTransform {
  mode: 'mesh'
  mesh: MeshGridState
  /** Resolved vertex positions in source image space. */
  grid: Point[][]
  plotWidth: number
  plotHeight: number
  plotOffsetX: number
  plotOffsetY: number
  width: number
  height: number
  /** Perspective homography for areas outside the plot rect (row-major 3×3). */
  homography: number[]
}

export type CorrectionTransform = UnskewTransform | MeshWarpTransform

export function isMeshTransform(t: CorrectionTransform | null): t is MeshWarpTransform {
  return t != null && 'mode' in t && t.mode === 'mesh'
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function sub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]]
}

function scale(v: Point, s: number): Point {
  return [v[0] * s, v[1] * s]
}

function hermite(p0: Point, m0: Point, p1: Point, m1: Point, t: number): Point {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return [
    h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
  ]
}

function hermiteEdge(pts: Point[], tangents: Point[], t: number): Point {
  const numSegments = pts.length - 1
  const seg = t * numSegments
  const i = Math.min(numSegments - 1, Math.floor(seg))
  const local = seg - i
  const m0 = scale(tangents[i], 1 / numSegments)
  const m1 = scale(tangents[i + 1], 1 / numSegments)
  return hermite(pts[i], m0, pts[i + 1], m1, local)
}

export function meshGridSize(mesh: MeshGridState): number {
  return mesh.sections + 1
}

function isBoundaryVertex(i: number, j: number, size: number): boolean {
  const last = size - 1
  return i === 0 || i === last || j === 0 || j === last
}

function defaultTangentAlong(p0: Point, p1: Point): Point {
  return sub(p1, p0)
}

export interface PlotQuad {
  bl: Point
  br: Point
  tr: Point
  tl: Point
}

/** Plot quad (bottom-left/right, top-right/left) derived from calibration axis bounds. */
export function plotQuadFromCalibration(calibration: Calibration): PlotQuad | null {
  const bounds = getAxisBounds(calibration)
  if (!bounds) return null
  const xmin = bounds.xmin.pixel
  const xmax = bounds.xmax.pixel
  const ymin = bounds.ymin.pixel
  const ymax = bounds.ymax.pixel
  try {
    const origin = lineIntersection(xmin, xmax, ymin, ymax)
    const br = projectOnLine(xmax, xmin, xmax)
    const tl = projectOnLine(ymax, ymin, ymax)
    const tr: Point = [
      origin[0] + (br[0] - origin[0]) + (tl[0] - origin[0]),
      origin[1] + (br[1] - origin[1]) + (tl[1] - origin[1]),
    ]
    return { bl: origin, br, tr, tl }
  } catch {
    return null
  }
}

const QUAD_EPS = 0.5

export function plotQuadsMatch(a: PlotQuad | null, b: PlotQuad | null): boolean {
  if (!a || !b) return a === b
  const keys: (keyof PlotQuad)[] = ['bl', 'br', 'tr', 'tl']
  return keys.every((k) => Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) < QUAD_EPS)
}

/** Mesh's own boundary quad (its four corner vertices), independent of calibration. */
export function meshPlotQuad(mesh: MeshGridState): PlotQuad {
  const last = mesh.sections
  return {
    bl: mesh.vertices[last][0].position,
    br: mesh.vertices[last][last].position,
    tr: mesh.vertices[0][last].position,
    tl: mesh.vertices[0][0].position,
  }
}

/** Remap every mesh vertex position + tangent from one plot quad onto another via homography. */
export function remeshToPlotQuad(mesh: MeshGridState, from: PlotQuad, to: PlotQuad): MeshGridState {
  const matrix = computeQuadToQuadHomography(
    [from.bl, from.br, from.tr, from.tl],
    [to.bl, to.br, to.tr, to.tl],
  )
  const mapPos = (p: Point): Point => applyHomography(matrix, p, false)
  const mapVec = (p: Point, v: Point): Point => {
    const p0 = mapPos(p)
    const p1 = mapPos([p[0] + v[0], p[1] + v[1]])
    return [p1[0] - p0[0], p1[1] - p0[1]]
  }
  const vertices = mesh.vertices.map((row) =>
    row.map((v) => {
      const position = mapPos(v.position)
      const out: MeshVertex = { position }
      if (v.tangentH) out.tangentH = mapVec(v.position, v.tangentH)
      if (v.tangentV) out.tangentV = mapVec(v.position, v.tangentV)
      return out
    }),
  )
  return { sections: mesh.sections, rows: mesh.rows, cols: mesh.cols, vertices }
}

/** Build initial mesh from calibration plot quad (same corners as perspective unskew). */
export function initMeshFromCalibration(
  calibration: Calibration,
  sections: number = DEFAULT_MESH_SECTIONS,
): MeshGridState {
  const n = sections
  const size = n + 1
  const bounds = getAxisBounds(calibration)
  if (!bounds) throw new UnskewError('Calibration bounds unavailable')

  const xmin = bounds.xmin.pixel
  const xmax = bounds.xmax.pixel
  const ymin = bounds.ymin.pixel
  const ymax = bounds.ymax.pixel

  const origin = lineIntersection(xmin, xmax, ymin, ymax)
  const br = projectOnLine(xmax, xmin, xmax)
  const tl = projectOnLine(ymax, ymin, ymax)
  const tr: Point = [
    origin[0] + (br[0] - origin[0]) + (tl[0] - origin[0]),
    origin[1] + (br[1] - origin[1]) + (tl[1] - origin[1]),
  ]

  const boundaryPosition = (i: number, j: number): Point => {
    if (i === 0) return lerp(tl, tr, j / n)
    if (i === n) return lerp(origin, br, j / n)
    if (j === 0) return lerp(tl, origin, i / n)
    return lerp(tr, br, i / n)
  }

  const vertices: MeshVertex[][] = []
  for (let i = 0; i < size; i++) {
    const row: MeshVertex[] = []
    for (let j = 0; j < size; j++) {
      if (!isBoundaryVertex(i, j, size)) {
        row.push({ position: [0, 0] })
        continue
      }
      const pos = boundaryPosition(i, j)
      const vtx: MeshVertex = { position: pos }
      if (j < n) vtx.tangentH = defaultTangentAlong(pos, boundaryPosition(i, j + 1))
      else if (j > 0) vtx.tangentH = defaultTangentAlong(pos, boundaryPosition(i, j - 1))
      if (i < n) vtx.tangentV = defaultTangentAlong(pos, boundaryPosition(i + 1, j))
      else if (i > 0) vtx.tangentV = defaultTangentAlong(pos, boundaryPosition(i - 1, j))
      row.push(vtx)
    }
    vertices.push(row)
  }
  return { sections: n, rows: size, cols: size, vertices }
}

/** Change mesh subdivision count, preserving the current boundary shape via Coons resampling. */
export function resizeMeshSections(mesh: MeshGridState, newSections: number): MeshGridState {
  const clamped = Math.max(MIN_MESH_SECTIONS, Math.min(MAX_MESH_SECTIONS, newSections))
  if (clamped === mesh.sections) return mesh

  const size = clamped + 1
  const vertices: MeshVertex[][] = []
  for (let i = 0; i < size; i++) {
    const row: MeshVertex[] = []
    for (let j = 0; j < size; j++) {
      if (!isBoundaryVertex(i, j, size)) {
        row.push({ position: [0, 0] })
        continue
      }
      const u = j / clamped
      const v = i / clamped
      const pos = evalCoons(mesh, u, v)
      const vtx: MeshVertex = { position: pos }
      if (j < clamped) {
        vtx.tangentH = defaultTangentAlong(pos, evalCoons(mesh, (j + 1) / clamped, v))
      } else if (j > 0) {
        vtx.tangentH = defaultTangentAlong(pos, evalCoons(mesh, (j - 1) / clamped, v))
      }
      if (i < clamped) {
        vtx.tangentV = defaultTangentAlong(pos, evalCoons(mesh, u, (i + 1) / clamped))
      } else if (i > 0) {
        vtx.tangentV = defaultTangentAlong(pos, evalCoons(mesh, u, (i - 1) / clamped))
      }
      row.push(vtx)
    }
    vertices.push(row)
  }
  return { sections: clamped, rows: size, cols: size, vertices }
}

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

function projectOnLine(point: Point, lineA: Point, lineB: Point): Point {
  const dx = lineB[0] - lineA[0]
  const dy = lineB[1] - lineA[1]
  const denom = dx * dx + dy * dy
  if (denom < 1e-9) throw new UnskewError('Degenerate axis line')
  const t = ((point[0] - lineA[0]) * dx + (point[1] - lineA[1]) * dy) / denom
  return [lineA[0] + t * dx, lineA[1] + t * dy]
}

function boundaryRow(mesh: MeshGridState, i: number): Point[] {
  const size = meshGridSize(mesh)
  return Array.from({ length: size }, (_, j) => mesh.vertices[i][j].position)
}

function boundaryCol(mesh: MeshGridState, j: number): Point[] {
  const size = meshGridSize(mesh)
  return Array.from({ length: size }, (_, i) => mesh.vertices[i][j].position)
}

function rowTangentsH(mesh: MeshGridState, i: number): Point[] {
  const size = meshGridSize(mesh)
  return Array.from({ length: size }, (_, j) => mesh.vertices[i][j].tangentH ?? [0, 0])
}

function colTangentsV(mesh: MeshGridState, j: number): Point[] {
  const size = meshGridSize(mesh)
  return Array.from({ length: size }, (_, i) => mesh.vertices[i][j].tangentV ?? [0, 0])
}

/** Coons patch evaluation: (u,v) ∈ [0,1]² → source image position. */
export function evalCoons(mesh: MeshGridState, u: number, v: number): Point {
  const last = mesh.sections
  const top = hermiteEdge(boundaryRow(mesh, 0), rowTangentsH(mesh, 0), u)
  const bottom = hermiteEdge(boundaryRow(mesh, last), rowTangentsH(mesh, last), u)
  const left = hermiteEdge(boundaryCol(mesh, 0), colTangentsV(mesh, 0), v)
  const right = hermiteEdge(boundaryCol(mesh, last), colTangentsV(mesh, last), v)

  const p00 = mesh.vertices[0][0].position
  const p03 = mesh.vertices[0][last].position
  const p30 = mesh.vertices[last][0].position
  const p33 = mesh.vertices[last][last].position

  const bilinear =
    (1 - u) * (1 - v) * p00[0] +
    u * (1 - v) * p03[0] +
    (1 - u) * v * p30[0] +
    u * v * p33[0]
  const bilinearY =
    (1 - u) * (1 - v) * p00[1] +
    u * (1 - v) * p03[1] +
    (1 - u) * v * p30[1] +
    u * v * p33[1]

  return [
    (1 - v) * top[0] + v * bottom[0] + (1 - u) * left[0] + u * right[0] - bilinear,
    (1 - v) * top[1] + v * bottom[1] + (1 - u) * left[1] + u * right[1] - bilinearY,
  ]
}

/** Resolve full grid positions at uniform spacing. */
export function resolveMeshGrid(mesh: MeshGridState): Point[][] {
  const size = meshGridSize(mesh)
  const n = mesh.sections
  const grid: Point[][] = []
  for (let i = 0; i < size; i++) {
    const row: Point[] = []
    for (let j = 0; j < size; j++) {
      row.push(evalCoons(mesh, j / n, i / n))
    }
    grid.push(row)
  }
  return grid
}

/** Bilinear cell map: local (s,t) ∈ [0,1]² within cell (ci,cj). */
function evalCell(grid: Point[][], ci: number, cj: number, s: number, t: number): Point {
  const p00 = grid[ci][cj]
  const p01 = grid[ci][cj + 1]
  const p10 = grid[ci + 1][cj]
  const p11 = grid[ci + 1][cj + 1]
  return [
    (1 - s) * (1 - t) * p00[0] + s * (1 - t) * p01[0] + (1 - s) * t * p10[0] + s * t * p11[0],
    (1 - s) * (1 - t) * p00[1] + s * (1 - t) * p01[1] + (1 - s) * t * p10[1] + s * t * p11[1],
  ]
}

export function evalMeshUV(grid: Point[][], u: number, v: number): Point {
  const sections = grid.length - 1
  const uu = Math.max(0, Math.min(1, u))
  const vv = Math.max(0, Math.min(1, v))
  const uf = uu * sections
  const vf = vv * sections
  const ci = Math.min(sections - 1, Math.floor(vf))
  const cj = Math.min(sections - 1, Math.floor(uf))
  const s = uf - cj
  const t = vf - ci
  return evalCell(grid, ci, cj, s, t)
}

function quadArea(a: Point, b: Point, c: Point, d: Point): number {
  let area = 0
  const pts = [a, b, c, d]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
  }
  return Math.abs(area) * 0.5
}

export function validateMesh(mesh: MeshGridState): void {
  const grid = resolveMeshGrid(mesh)
  const n = mesh.sections
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const area = quadArea(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
      if (area < 1) throw new UnskewError('Degenerate mesh cell')
    }
  }
}

export function isMeshWithinImage(
  mesh: MeshGridState,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const margin = 50
  const size = meshGridSize(mesh)
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (!isBoundaryVertex(i, j, size)) continue
      const [x, y] = mesh.vertices[i][j].position
      if (
        x < -margin ||
        y < -margin ||
        x > imageWidth + margin ||
        y > imageHeight + margin
      ) {
        return false
      }
    }
  }
  return true
}

export function sanitizeMeshForImage(
  mesh: MeshGridState,
  calibration: Calibration,
  imageWidth: number,
  imageHeight: number,
): MeshGridState {
  if (isMeshWithinImage(mesh, imageWidth, imageHeight)) return mesh
  return initMeshFromCalibration(calibration)
}

export function computeMeshWarpTransform(
  mesh: MeshGridState,
  calibration: Calibration,
  imageWidth: number,
  imageHeight: number,
  options?: { sanitize?: boolean },
): MeshWarpTransform {
  const safeMesh =
    options?.sanitize === false
      ? mesh
      : sanitizeMeshForImage(mesh, calibration, imageWidth, imageHeight)
  validateMesh(safeMesh)
  const bounds = getAxisBounds(calibration)
  if (!bounds) throw new UnskewError('Calibration bounds unavailable')

  const perspective = computeUnskewHomography(
    bounds.xmin.pixel,
    bounds.xmax.pixel,
    bounds.ymin.pixel,
    bounds.ymax.pixel,
    imageWidth,
    imageHeight,
  )

  const origin = lineIntersection(
    bounds.xmin.pixel,
    bounds.xmax.pixel,
    bounds.ymin.pixel,
    bounds.ymax.pixel,
  )
  const br = projectOnLine(bounds.xmax.pixel, bounds.xmin.pixel, bounds.xmax.pixel)
  const plotWidth = Math.hypot(br[0] - origin[0], br[1] - origin[1])
  const tl = projectOnLine(bounds.ymax.pixel, bounds.ymin.pixel, bounds.ymax.pixel)
  const plotHeight = Math.hypot(tl[0] - origin[0], tl[1] - origin[1])

  const blOut = applyHomography(perspective.matrix, origin, false)
  const grid = resolveMeshGrid(safeMesh)

  const result = {
    mode: 'mesh' as const,
    mesh: safeMesh,
    grid,
    plotWidth,
    plotHeight,
    plotOffsetX: blOut[0],
    plotOffsetY: blOut[1],
    width: perspective.width,
    height: perspective.height,
    homography: perspective.matrix,
  }

  return result
}

function plotTopY(t: MeshWarpTransform): number {
  return t.plotOffsetY - t.plotHeight
}

/**
 * How far beyond the plot's [0,1] UV range the mesh's local deformation still
 * has influence before fully fading into plain homography. Expressed as a
 * fraction of the plot's own width/height, so the blend zone scales with the
 * mesh instead of being a fixed pixel margin.
 */
const MESH_BLEND_MARGIN_UV = 0.3

function uvOvershoot(t: number): number {
  if (t < 0) return -t
  if (t > 1) return t - 1
  return 0
}

/** 0 inside the plot rect, ramps smoothly to 1 at MESH_BLEND_MARGIN_UV beyond it. */
function meshBlendFactor(u: number, v: number): number {
  const overshoot = Math.max(uvOvershoot(u), uvOvershoot(v))
  if (overshoot <= 0) return 0
  if (overshoot >= MESH_BLEND_MARGIN_UV) return 1
  const t = overshoot / MESH_BLEND_MARGIN_UV
  return t * t * (3 - 2 * t)
}

/** Like evalMeshUV, but doesn't clamp (u,v) — extrapolates linearly past the
 *  boundary cells so the mesh's local shape keeps influencing nearby pixels. */
function evalMeshUVExtrapolated(grid: Point[][], u: number, v: number): Point {
  const sections = grid.length - 1
  const uf = u * sections
  const vf = v * sections
  const ci = Math.max(0, Math.min(sections - 1, Math.floor(vf)))
  const cj = Math.max(0, Math.min(sections - 1, Math.floor(uf)))
  const s = uf - cj
  const t = vf - ci
  return evalCell(grid, ci, cj, s, t)
}

function sourceToDestRoundtripError(source: Point, dest: Point, transform: MeshWarpTransform): number {
  const back = mapDestToSource(dest, transform)
  return Math.hypot(source[0] - back[0], source[1] - back[1])
}

function invertDestToSourceNumerically(source: Point, transform: MeshWarpTransform): Point {
  const homogGuess = applyHomography(transform.homography, source, false)
  const seeds: Point[] = [
    homogGuess,
    [transform.plotOffsetX, transform.plotOffsetY],
    [transform.plotOffsetX + transform.plotWidth, transform.plotOffsetY],
    [transform.plotOffsetX, plotTopY(transform)],
    [transform.plotOffsetX + transform.plotWidth, plotTopY(transform)],
  ]
  let best = homogGuess
  let bestErr = sourceToDestRoundtripError(source, homogGuess, transform)

  for (const seed of seeds) {
    const candidate = newtonInvertDestToSource(source, transform, seed)
    const err = sourceToDestRoundtripError(source, candidate, transform)
    if (err < bestErr) {
      bestErr = err
      best = candidate
    }
  }

  if (bestErr < 0.5) return best
  return best
}

function newtonInvertDestToSource(source: Point, transform: MeshWarpTransform, guess: Point): Point {
  let [dx, dy] = guess
  const eps = 0.5
  for (let iter = 0; iter < 25; iter++) {
    const back = mapDestToSource([dx, dy], transform)
    const errX = source[0] - back[0]
    const errY = source[1] - back[1]
    if (Math.hypot(errX, errY) < 0.5) return [dx, dy]

    const bx = mapDestToSource([dx + eps, dy], transform)
    const by = mapDestToSource([dx, dy + eps], transform)
    const j00 = (bx[0] - back[0]) / eps
    const j01 = (by[0] - back[0]) / eps
    const j10 = (bx[1] - back[1]) / eps
    const j11 = (by[1] - back[1]) / eps
    const det = j00 * j11 - j01 * j10
    if (Math.abs(det) < 1e-12) break
    dx += (errX * j11 - errY * j01) / det
    dy += (-errX * j10 + errY * j00) / det
  }
  return [dx, dy]
}

/** Map source image pixel → corrected output pixel. */
export function mapSourceToDest(source: Point, transform: MeshWarpTransform): Point {
  return invertDestToSourceNumerically(source, transform)
}

/** Map corrected output pixel → source image pixel (for warping / clicks). */
export function mapDestToSource(dest: Point, transform: MeshWarpTransform): Point {
  const [dx, dy] = dest
  const u = (dx - transform.plotOffsetX) / transform.plotWidth
  const v = (dy - plotTopY(transform)) / transform.plotHeight
  const t = meshBlendFactor(u, v)
  if (t >= 1) return applyHomography(transform.homography, dest, true)
  const meshSource = evalMeshUVExtrapolated(transform.grid, u, v)
  if (t <= 0) return meshSource
  const homogSource = applyHomography(transform.homography, dest, true)
  return [
    meshSource[0] + (homogSource[0] - meshSource[0]) * t,
    meshSource[1] + (homogSource[1] - meshSource[1]) * t,
  ]
}

export function isMeshReady(
  calibration: Calibration | null,
  mesh: MeshGridState | null,
  imageWidth: number,
  imageHeight: number,
): boolean {
  if (!calibration || !mesh || imageWidth < 1 || imageHeight < 1) return false
  if (!areCalibrationPixelsInImage(calibration, imageWidth, imageHeight)) return false
  try {
    computeMeshWarpTransform(mesh, calibration, imageWidth, imageHeight)
    return true
  } catch {
    return false
  }
}

function sampleBilinear(
  data: ImageData,
  x: number,
  y: number,
): [number, number, number, number] {
  const { width, height, data: px } = data
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return [0, 0, 0, 0]

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
    out[c] =
      (1 - fx) * (1 - fy) * px[i00 + c] +
      fx * (1 - fy) * px[i10 + c] +
      (1 - fx) * fy * px[i01 + c] +
      fx * fy * px[i11 + c]
  }
  return out
}

export async function warpImageMeshToCanvas(
  image: HTMLImageElement,
  transform: MeshWarpTransform,
  sourceSize?: { width: number; height: number },
): Promise<HTMLCanvasElement> {
  const homogTransform: UnskewTransform = {
    matrix: transform.homography,
    width: transform.width,
    height: transform.height,
  }
  const canvas = await warpImageToCanvas(image, homogTransform, sourceSize)
  const w = canvas.width
  const h = canvas.height
  const top = plotTopY(transform)
  const left = transform.plotOffsetX
  const right = left + transform.plotWidth
  const bottom = transform.plotOffsetY
  const marginX = transform.plotWidth * MESH_BLEND_MARGIN_UV
  const marginY = transform.plotHeight * MESH_BLEND_MARGIN_UV
  const x0 = Math.max(0, Math.floor(left - marginX))
  const y0 = Math.max(0, Math.floor(top - marginY))
  const x1 = Math.min(w, Math.ceil(right + marginX))
  const y1 = Math.min(h, Math.ceil(bottom + marginY))
  if (x1 <= x0 || y1 <= y0) return canvas

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new UnskewError('Canvas 2D context unavailable')

  const srcData = buildSourceImageData(image, {
    width: sourceSize?.width ?? image.naturalWidth,
    height: sourceSize?.height ?? image.naturalHeight,
  })

  const roiW = x1 - x0
  const roiH = y1 - y0
  const patch = ctx.getImageData(x0, y0, roiW, roiH)
  const rowsPerChunk = 32
  for (let yStart = 0; yStart < roiH; yStart += rowsPerChunk) {
    const yEnd = Math.min(yStart + rowsPerChunk, roiH)
    for (let py = yStart; py < yEnd; py++) {
      const dy = y0 + py
      for (let px = 0; px < roiW; px++) {
        const dx = x0 + px
        const [sx, sy] = mapDestToSource([dx, dy], transform)
        const rgba = sampleBilinear(srcData, sx, sy)
        const di = (py * roiW + px) * 4
        patch.data[di] = rgba[0]
        patch.data[di + 1] = rgba[1]
        patch.data[di + 2] = rgba[2]
        patch.data[di + 3] = rgba[3]
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  ctx.putImageData(patch, x0, y0)

  return canvas
}

export interface MeshVertexPayload {
  row: number
  col: number
  position: [number, number]
  tangent_h?: [number, number]
  tangent_v?: [number, number]
}

export function meshToPayload(mesh: MeshGridState): { sections: number; vertices: MeshVertexPayload[] } {
  const size = meshGridSize(mesh)
  const out: MeshVertexPayload[] = []
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (!isBoundaryVertex(i, j, size)) continue
      const v = mesh.vertices[i][j]
      const entry: MeshVertexPayload = { row: i, col: j, position: v.position }
      if (v.tangentH) entry.tangent_h = v.tangentH
      if (v.tangentV) entry.tangent_v = v.tangentV
      out.push(entry)
    }
  }
  return { sections: mesh.sections, vertices: out }
}

export function meshFromPayload(
  payload: { sections?: number; vertices: MeshVertexPayload[] },
  base: MeshGridState,
): MeshGridState {
  const sections = payload.sections ?? base.sections
  const size = sections + 1
  const vertices = base.vertices.map((row) => row.map((v) => ({ ...v, position: [...v.position] as Point })))
  for (const v of payload.vertices) {
    const cell = vertices[v.row]?.[v.col]
    if (!cell) continue
    cell.position = v.position
    if (v.tangent_h) cell.tangentH = v.tangent_h
    if (v.tangent_v) cell.tangentV = v.tangent_v
  }
  return { sections, rows: size, cols: size, vertices }
}

export function inferMeshSectionsFromPayload(payload: { sections?: number; vertices: MeshVertexPayload[] }): number {
  if (payload.sections != null) return payload.sections
  let maxIndex = 0
  for (const v of payload.vertices) {
    maxIndex = Math.max(maxIndex, v.row, v.col)
  }
  return maxIndex > 0 ? maxIndex : DEFAULT_MESH_SECTIONS
}

export function restoreMeshFromWorkspace(
  calibration: Calibration,
  payload: { sections?: number; vertices: MeshVertexPayload[] },
  imageWidth: number,
  imageHeight: number,
): MeshGridState {
  const sections = inferMeshSectionsFromPayload(payload)
  const merged = meshFromPayload(payload, initMeshFromCalibration(calibration, sections))
  return sanitizeMeshForImage(merged, calibration, imageWidth, imageHeight)
}

export function getDisplaySize(transform: CorrectionTransform | null): { width: number; height: number } {
  if (!transform) return { width: 0, height: 0 }
  if (isMeshTransform(transform)) return { width: transform.width, height: transform.height }
  return { width: transform.width, height: transform.height }
}

/** Map axis bound source pixel → rectified plot position (bottom/left edges in dest space). */
export function mapAxisBoundToDisplay(
  key: AxisBoundKey,
  pixel: Point,
  calibration: Calibration,
  transform: MeshWarpTransform,
): Point {
  const bounds = getAxisBounds(calibration)
  if (!bounds) return mapSourceToDest(pixel, transform)

  const xmin = bounds.xmin.pixel
  const xmax = bounds.xmax.pixel
  const ymin = bounds.ymin.pixel
  const ymax = bounds.ymax.pixel
  const origin = lineIntersection(xmin, xmax, ymin, ymax)
  const br = projectOnLine(xmax, xmin, xmax)
  const tl = projectOnLine(ymax, ymin, ymax)

  if (key === 'xmin' || key === 'xmax') {
    const brVec = sub(br, origin)
    const len2 = brVec[0] ** 2 + brVec[1] ** 2
    const u =
      len2 < 1e-9
        ? 0
        : ((pixel[0] - origin[0]) * brVec[0] + (pixel[1] - origin[1]) * brVec[1]) / len2
    return [transform.plotOffsetX + u * transform.plotWidth, transform.plotOffsetY]
  }

  const tlVec = sub(origin, tl)
  const len2 = tlVec[0] ** 2 + tlVec[1] ** 2
  const v =
    len2 < 1e-9
      ? 0
      : ((pixel[0] - tl[0]) * tlVec[0] + (pixel[1] - tl[1]) * tlVec[1]) / len2
  return [transform.plotOffsetX, plotTopY(transform) + v * transform.plotHeight]
}

/** Map rectified plot position → axis bound source pixel (inverse of mapAxisBoundToDisplay). */
export function mapDisplayToAxisBound(
  key: AxisBoundKey,
  display: Point,
  calibration: Calibration,
  transform: MeshWarpTransform,
): Point {
  const bounds = getAxisBounds(calibration)
  if (!bounds) return mapDestToSource(display, transform)

  const xmin = bounds.xmin.pixel
  const xmax = bounds.xmax.pixel
  const ymin = bounds.ymin.pixel
  const ymax = bounds.ymax.pixel
  const origin = lineIntersection(xmin, xmax, ymin, ymax)
  const br = projectOnLine(xmax, xmin, xmax)
  const tl = projectOnLine(ymax, ymin, ymax)

  if (key === 'xmin' || key === 'xmax') {
    const u = (display[0] - transform.plotOffsetX) / transform.plotWidth
    const brVec = sub(br, origin)
    return [origin[0] + u * brVec[0], origin[1] + u * brVec[1]]
  }

  const v = (display[1] - plotTopY(transform)) / transform.plotHeight
  const tlVec = sub(origin, tl)
  return [tl[0] + v * tlVec[0], tl[1] + v * tlVec[1]]
}

export function mapPointToDisplay(
  original: Point,
  transform: CorrectionTransform | null,
): Point {
  if (!transform) return original
  if (isMeshTransform(transform)) return mapSourceToDest(original, transform)
  return applyHomography(transform.matrix, original, false)
}

export function mapPointToOriginal(
  display: Point,
  transform: CorrectionTransform | null,
): Point {
  if (!transform) return display
  if (isMeshTransform(transform)) return mapDestToSource(display, transform)
  return applyHomography(transform.matrix, display, true)
}
