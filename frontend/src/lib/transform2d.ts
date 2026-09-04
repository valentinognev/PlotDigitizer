import type {
  AxisPoint,
  Calibration,
  CoordsType,
  ScaleBar,
  ThetaUnits,
  TransformModel,
} from '../types'

export type { Calibration }

export class CalibrationError extends Error {
  hint: string
  constructor(message: string, hint = '') {
    super(message)
    this.name = 'CalibrationError'
    this.hint = hint
  }
}

export interface Constraint {
  pixel: [number, number]
  axis: 'u' | 'v'
  value: number
}

export interface Transform2D {
  model: Exclude<TransformModel, 'auto'>
  matrix: number[][]
}

const COLLINEAR_AREA = 1e-6
const DENOM_TOL = 1e-15
const RANK_TOL = 1e-10
const RESOLVE_EPS = 0.5

function coordsType(cal: Calibration): CoordsType {
  return cal.coords_type ?? 'cartesian'
}

function thetaUnits(cal: Calibration): ThetaUnits {
  return cal.theta_units ?? 'degrees'
}

function originRadius(cal: Calibration): number {
  return cal.origin_radius ?? 0
}

function axisPoints(cal: Calibration): AxisPoint[] {
  return cal.axis_points ?? []
}

function logValue(value: number, scale: 'linear' | 'log', axisName: string): number {
  if (scale === 'log') {
    if (value <= 0) {
      throw new CalibrationError(
        `${axisName} log scale requires all reference values > 0`,
        'Use linear scale or enter values greater than zero',
      )
    }
    return Math.log10(value)
  }
  return value
}

function thetaToRadians(theta: number, units: ThetaUnits): number {
  if (units === 'degrees') return (theta * Math.PI) / 180
  if (units === 'radians') return theta
  if (units === 'gradians') return (theta * Math.PI) / 200
  return theta * 2 * Math.PI
}

function radiansToTheta(rad: number, units: ThetaUnits): number {
  if (units === 'degrees') return (rad * 180) / Math.PI
  if (units === 'radians') return rad
  if (units === 'gradians') return (rad * 200) / Math.PI
  return rad / (2 * Math.PI)
}

function rhoOf(radius: number, scale: 'linear' | 'log', origin: number): number {
  if (scale === 'log') {
    if (radius <= 0) {
      throw new CalibrationError('polar log radius requires all R values > 0', 'Enter a positive radius')
    }
    return Math.log10(radius)
  }
  return radius - origin
}

export function lstsq(A: number[][], b: number[]): number[] {
  const m = A.length
  const n = A[0]?.length ?? 0
  if (m < n) throw new CalibrationError('Not enough constraints for this transform model', 'Add more axis points')
  const ata: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  const atb: number[] = Array(n).fill(0)
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < n; k++) {
      atb[k] += A[i][k] * b[i]
      for (let j = 0; j < n; j++) ata[k][j] += A[i][k] * A[i][j]
    }
  }
  const aug = ata.map((row, i) => [...row, atb[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
    }
    if (Math.abs(aug[pivot][col]) < RANK_TOL) {
      throw new CalibrationError('Transform system is degenerate', 'Add more non-collinear axis points')
    }
    if (pivot !== col) {
      const tmp = aug[col]
      aug[col] = aug[pivot]
      aug[pivot] = tmp
    }
    const div = aug[col][col]
    for (let j = col; j <= n; j++) aug[col][j] /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = aug[r][col]
      for (let j = col; j <= n; j++) aug[r][j] -= f * aug[col][j]
    }
  }
  return aug.map((row) => row[n])
}

function applyH(matrix: number[][], x: number, y: number): [number, number] {
  const u = matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]
  const v = matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]
  const w = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2]
  if (Math.abs(w) < DENOM_TOL) {
    throw new CalibrationError('Projective transform denominator is zero', 'Move axis points off the vanishing line')
  }
  return [u / w, v / w]
}

function inv3(m: number[][]): number[][] {
  const a = m[0][0], b = m[0][1], c = m[0][2]
  const d = m[1][0], e = m[1][1], f = m[1][2]
  const g = m[2][0], h = m[2][1], i = m[2][2]
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
  if (Math.abs(det) < RANK_TOL) {
    throw new CalibrationError('Transform matrix is not invertible', 'Add more non-collinear axis points')
  }
  return [
    [A / det, D / det, G / det],
    [B / det, E / det, H / det],
    [C / det, F / det, I / det],
  ]
}

function toLinear(t: Transform2D, pixel: [number, number]): [number, number] {
  return applyH(t.matrix, pixel[0], pixel[1])
}

function fromLinear(t: Transform2D, uv: [number, number]): [number, number] {
  return applyH(inv3(t.matrix), uv[0], uv[1])
}

function collinear(pixels: [number, number][]): boolean {
  const unique: [number, number][] = []
  for (const p of pixels) {
    if (unique.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9)) unique.push(p)
  }
  if (unique.length < 3) return unique.length < 3 && pixels.length >= 3
  const [x0, y0] = unique[0]
  const [x1, y1] = unique[1]
  for (let i = 2; i < unique.length; i++) {
    const [x, y] = unique[i]
    const area = Math.abs((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0))
    if (area > COLLINEAR_AREA) return false
  }
  return true
}

function pixelsFor(constraints: Constraint[], axis: 'u' | 'v'): [number, number][] {
  return constraints.filter((c) => c.axis === axis).map((c) => c.pixel)
}

function distinctCoord(pixels: [number, number][], index: 0 | 1): boolean {
  return new Set(pixels.map((p) => p[index])).size >= 2
}

function fullPoints(constraints: Constraint[]): { pixel: [number, number]; u: number; v: number }[] {
  const map = new Map<string, { pixel: [number, number]; u?: number; v?: number }>()
  for (const c of constraints) {
    const key = `${c.pixel[0]},${c.pixel[1]}`
    const cur = map.get(key) ?? { pixel: c.pixel }
    if (c.axis === 'u') cur.u = c.value
    else cur.v = c.value
    map.set(key, cur)
  }
  const out: { pixel: [number, number]; u: number; v: number }[] = []
  for (const cur of map.values()) {
    if (cur.u !== undefined && cur.v !== undefined) out.push({ pixel: cur.pixel, u: cur.u, v: cur.v })
  }
  return out
}

function solveOrthogonal(constraints: Constraint[]): Transform2D {
  const uPts = pixelsFor(constraints, 'u')
  const vPts = pixelsFor(constraints, 'v')
  const hint = 'Need ≥2 X constraints with distinct px and ≥2 Y constraints with distinct py'
  if (uPts.length < 2 || vPts.length < 2) throw new CalibrationError('Orthogonal model needs 2 X and 2 Y constraints', hint)
  if (!distinctCoord(uPts, 0) || !distinctCoord(vPts, 1)) {
    throw new CalibrationError('Orthogonal reference pixels are degenerate', hint)
  }
  const A: number[][] = []
  const b: number[] = []
  for (const c of constraints) {
    const [px, py] = c.pixel
    if (c.axis === 'u') {
      A.push([px, 1, 0, 0])
      b.push(c.value)
    } else {
      A.push([0, 0, py, 1])
      b.push(c.value)
    }
  }
  const [a, c0, e, f] = lstsq(A, b)
  return { model: 'orthogonal', matrix: [[a, 0, c0], [0, e, f], [0, 0, 1]] }
}

function solveAffine(constraints: Constraint[]): Transform2D {
  const uPts = pixelsFor(constraints, 'u')
  const vPts = pixelsFor(constraints, 'v')
  const hint = 'Need ≥3 non-collinear points pinning X and ≥3 non-collinear points pinning Y'
  if (uPts.length < 3 || vPts.length < 3) throw new CalibrationError('Affine model needs 3 X and 3 Y constraints', hint)
  if (collinear(uPts) || collinear(vPts)) throw new CalibrationError('Affine axis points are collinear', hint)
  const A: number[][] = []
  const b: number[] = []
  for (const c of constraints) {
    const [px, py] = c.pixel
    if (c.axis === 'u') {
      A.push([px, py, 1, 0, 0, 0])
      b.push(c.value)
    } else {
      A.push([0, 0, 0, px, py, 1])
      b.push(c.value)
    }
  }
  const [a, b0, c0, d, e, f] = lstsq(A, b)
  return { model: 'affine', matrix: [[a, b0, c0], [d, e, f], [0, 0, 1]] }
}

function solveProjective(constraints: Constraint[]): Transform2D {
  const full = fullPoints(constraints)
  const hint = 'Need ≥4 full (X,Y) points that are not all collinear'
  if (full.length < 4) throw new CalibrationError('Projective model needs 4 full (X,Y) points', hint)
  const pixels = full.map((p) => p.pixel)
  if (collinear(pixels)) throw new CalibrationError('Projective axis points are collinear', hint)
  const A: number[][] = []
  const b: number[] = []
  for (const p of full) {
    const [px, py] = p.pixel
    A.push([px, py, 1, 0, 0, 0, -p.u * px, -p.u * py])
    b.push(p.u)
    A.push([0, 0, 0, px, py, 1, -p.v * px, -p.v * py])
    b.push(p.v)
  }
  const h = lstsq(A, b)
  return {
    model: 'projective',
    matrix: [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1],
    ],
  }
}

const SOLVERS = {
  orthogonal: solveOrthogonal,
  affine: solveAffine,
  projective: solveProjective,
}

export function solveTransform(
  constraints: Constraint[],
  model: TransformModel = 'auto',
): Transform2D {
  if (!constraints.length) {
    throw new CalibrationError('No constraints to solve', 'Place axis bounds or precise axis points')
  }
  if (model !== 'auto') return SOLVERS[model](constraints)
  let last: CalibrationError | undefined
  for (const candidate of ['projective', 'affine', 'orthogonal'] as const) {
    try {
      return SOLVERS[candidate](constraints)
    } catch (err) {
      if (err instanceof CalibrationError) last = err
      else throw err
    }
  }
  throw new CalibrationError(
    'Cannot determine a transform from these axis points',
    last?.hint ?? 'Add more non-collinear points that pin X and Y',
  )
}

export function buildConstraints(cal: Calibration): Constraint[] {
  const kind = coordsType(cal)
  if (kind === 'map') {
    throw new CalibrationError('Map calibrations do not use axis-point constraints', 'Set a scale bar instead of axis points')
  }
  const points = axisPoints(cal)
  if (points.length) {
    if (kind === 'polar') return constraintsPolar(cal, points)
    return constraintsAxisPoints(cal, points)
  }
  return constraintsRefPoints(cal)
}

function constraintsRefPoints(cal: Calibration): Constraint[] {
  const out: Constraint[] = []
  for (const rp of cal.x.ref_points) {
    out.push({ pixel: rp.pixel, axis: 'u', value: logValue(rp.value, cal.x.scale, 'x') })
  }
  for (const rp of cal.y.ref_points) {
    out.push({ pixel: rp.pixel, axis: 'v', value: logValue(rp.value, cal.y.scale, 'y') })
  }
  if (!out.length) throw new CalibrationError('Calibration has no reference points', 'Place X/Y bounds or precise axis points')
  return out
}

function constraintsAxisPoints(cal: Calibration, points: AxisPoint[]): Constraint[] {
  const out: Constraint[] = []
  for (const pt of points) {
    if (pt.x_value !== undefined && pt.x_value !== null) {
      out.push({ pixel: pt.pixel, axis: 'u', value: logValue(pt.x_value, cal.x.scale, 'x') })
    }
    if (pt.y_value !== undefined && pt.y_value !== null) {
      out.push({ pixel: pt.pixel, axis: 'v', value: logValue(pt.y_value, cal.y.scale, 'y') })
    }
  }
  if (!out.length) {
    throw new CalibrationError('Precise axis points do not pin any coordinate', 'Enter X and/or Y for each placed point')
  }
  return out
}

function constraintsPolar(cal: Calibration, points: AxisPoint[]): Constraint[] {
  const out: Constraint[] = []
  const units = thetaUnits(cal)
  const origin = originRadius(cal)
  for (const pt of points) {
    if (pt.x_value === undefined || pt.x_value === null || pt.y_value === undefined || pt.y_value === null) {
      throw new CalibrationError('Polar axis points must pin both θ and R', 'Enter angle and radius for every polar axis point')
    }
    const th = thetaToRadians(pt.x_value, units)
    const rho = rhoOf(pt.y_value, cal.y.scale, origin)
    out.push({ pixel: pt.pixel, axis: 'u', value: rho * Math.cos(th) })
    out.push({ pixel: pt.pixel, axis: 'v', value: rho * Math.sin(th) })
  }
  if (!out.length) {
    throw new CalibrationError('Polar calibration has no (θ, R) axis points', 'Place origin plus two more (θ, R) points')
  }
  return out
}

function mapScale(bar: ScaleBar): number {
  const dist = Math.hypot(bar.pixel_b[0] - bar.pixel_a[0], bar.pixel_b[1] - bar.pixel_a[1])
  if (dist < 1e-12) throw new CalibrationError('Scale bar pixels coincide', 'Place two distinct scale-bar endpoints')
  if (bar.length <= 0) throw new CalibrationError('Scale bar length must be positive', 'Enter the physical length between the two pixels')
  return bar.length / dist
}

function requireBar(cal: Calibration): ScaleBar {
  if (!cal.scale_bar) {
    throw new CalibrationError('Map calibration requires a scale bar', 'Place two pixels and enter the physical length')
  }
  return cal.scale_bar
}

function transformOf(cal: Calibration): Transform2D {
  const constraints = buildConstraints(cal)
  let requested: TransformModel = cal.model ?? 'auto'
  if (requested === 'auto' && !axisPoints(cal).length && coordsType(cal) === 'cartesian') requested = 'orthogonal'
  if (coordsType(cal) === 'polar' && requested === 'auto') requested = 'affine'
  return solveTransform(constraints, requested)
}

function fromLinearAxes(cal: Calibration, uv: [number, number]): [number, number] {
  const x = cal.x.scale === 'log' ? 10 ** uv[0] : uv[0]
  const y = cal.y.scale === 'log' ? 10 ** uv[1] : uv[1]
  return [x, y]
}

function toLinearAxes(cal: Calibration, data: [number, number]): [number, number] {
  let u = data[0]
  let v = data[1]
  if (cal.x.scale === 'log') {
    if (data[0] <= 0) throw new CalibrationError('Cannot map non-positive value on log axis', 'Log X requires values > 0')
    u = Math.log10(data[0])
  }
  if (cal.y.scale === 'log') {
    if (data[1] <= 0) throw new CalibrationError('Cannot map non-positive value on log axis', 'Log Y requires values > 0')
    v = Math.log10(data[1])
  }
  return [u, v]
}

function polarFromLinear(cal: Calibration, uv: [number, number]): [number, number] {
  const rho = Math.hypot(uv[0], uv[1])
  const theta = radiansToTheta(Math.atan2(uv[1], uv[0]), thetaUnits(cal))
  const radius = cal.y.scale === 'log' ? 10 ** rho : rho + originRadius(cal)
  return [theta, radius]
}

function polarToLinear(cal: Calibration, data: [number, number]): [number, number] {
  const th = thetaToRadians(data[0], thetaUnits(cal))
  let rho: number
  if (cal.y.scale === 'log') {
    if (data[1] <= 0) throw new CalibrationError('Cannot map non-positive radius on log polar axis', 'Log radius requires R > 0')
    rho = Math.log10(data[1])
  } else {
    rho = data[1] - originRadius(cal)
  }
  return [rho * Math.cos(th), rho * Math.sin(th)]
}

export function validateCalibration(cal: Calibration): void {
  const kind = coordsType(cal)
  if (kind === 'map') {
    mapScale(requireBar(cal))
    return
  }
  if (kind === 'polar') {
    if (axisPoints(cal).length < 3) {
      throw new CalibrationError('Polar calibration needs at least 3 axis points', 'Place origin plus two more (θ, R) points')
    }
    transformOf(cal)
    return
  }
  if (!axisPoints(cal).length) {
    if (cal.x.ref_points.length < 2) throw new CalibrationError('x axis needs at least 2 reference points', 'Place X min and X max')
    if (cal.y.ref_points.length < 2) throw new CalibrationError('y axis needs at least 2 reference points', 'Place Y min and Y max')
  }
  transformOf(cal)
}

export function pixelToData(cal: Calibration, pixel: [number, number]): [number, number] {
  if (coordsType(cal) === 'map') {
    const bar = requireBar(cal)
    const s = mapScale(bar)
    return [(pixel[0] - bar.pixel_a[0]) * s, (bar.pixel_a[1] - pixel[1]) * s]
  }
  const t = transformOf(cal)
  const uv = toLinear(t, pixel)
  if (coordsType(cal) === 'polar') return polarFromLinear(cal, uv)
  return fromLinearAxes(cal, uv)
}

export function dataToPixel(cal: Calibration, data: [number, number]): [number, number] {
  if (coordsType(cal) === 'map') {
    const bar = requireBar(cal)
    const s = mapScale(bar)
    return [bar.pixel_a[0] + data[0] / s, bar.pixel_a[1] - data[1] / s]
  }
  const t = transformOf(cal)
  if (coordsType(cal) === 'polar') return fromLinear(t, polarToLinear(cal, data))
  return fromLinear(t, toLinearAxes(cal, data))
}

export function resolutionAt(cal: Calibration, pixel: [number, number]): [number, number] {
  if (coordsType(cal) === 'map') {
    const s = mapScale(requireBar(cal))
    return [s, s]
  }
  const a0 = pixelToData(cal, pixel)
  const a1 = pixelToData(cal, [pixel[0] + RESOLVE_EPS, pixel[1]])
  const a2 = pixelToData(cal, [pixel[0], pixel[1] + RESOLVE_EPS])
  return [Math.abs(a1[0] - a0[0]) / RESOLVE_EPS, Math.abs(a2[1] - a0[1]) / RESOLVE_EPS]
}

export function resolvedModel(cal: Calibration): Exclude<TransformModel, 'auto'> {
  if (coordsType(cal) === 'map') return 'orthogonal'
  return transformOf(cal).model
}

function dataLimits(cal: Calibration): [number, number, number, number] {
  const xs: number[] = []
  const ys: number[] = []
  const points = axisPoints(cal)
  if (points.length) {
    for (const pt of points) {
      if (pt.x_value !== undefined && pt.x_value !== null) xs.push(pt.x_value)
      if (pt.y_value !== undefined && pt.y_value !== null) ys.push(pt.y_value)
    }
  } else {
    for (const p of cal.x.ref_points) xs.push(p.value)
    for (const p of cal.y.ref_points) ys.push(p.value)
  }
  if (xs.length < 2 || ys.length < 2) {
    throw new CalibrationError('Not enough pinned values to draw axes checker', 'Pin both X and Y extents')
  }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
}

export function axesCheckerPolyline(cal: Calibration, _imageSize: [number, number]): [number, number][] {
  const kind = coordsType(cal)
  if (kind === 'map') {
    const bar = requireBar(cal)
    const a = bar.pixel_a
    const b = bar.pixel_b
    const unit = dataToPixel(cal, [bar.length, 0])
    const up = dataToPixel(cal, [0, bar.length])
    return [a, b, a, up, a, unit, a]
  }
  if (kind === 'polar') {
    const points = axisPoints(cal)
    const radii = points.map((p) => p.y_value).filter((v): v is number => v !== undefined && v !== null)
    const thetas = points.map((p) => p.x_value).filter((v): v is number => v !== undefined && v !== null)
    let rInner: number
    let rOuter: number
    if (cal.y.scale === 'log') {
      const positive = radii.filter((r) => r > 0)
      rInner = positive.length ? Math.min(...positive) : 1
      rOuter = positive.length ? Math.max(...positive) : rInner
    } else {
      rInner = originRadius(cal)
      rOuter = radii.length ? Math.max(...radii) : rInner + 1
    }
    const units = thetaUnits(cal)
    const t0 = thetas.length ? Math.min(...thetas) : 0
    const t1 = thetas.length
      ? Math.max(...thetas)
      : units === 'degrees'
        ? 360
        : units === 'radians'
          ? Math.PI * 2
          : units === 'gradians'
            ? 400
            : 1
    const n = 32
    const poly: [number, number][] = []
    for (let i = 0; i <= n; i++) poly.push(dataToPixel(cal, [t0 + ((t1 - t0) * i) / n, rOuter]))
    for (let i = 0; i <= n; i++) poly.push(dataToPixel(cal, [t1 + ((t0 - t1) * i) / n, rInner]))
    poly.push(poly[0])
    return poly
  }
  const [xmin, xmax, ymin, ymax] = dataLimits(cal)
  const corners: [number, number][] = [
    [xmin, ymin],
    [xmax, ymin],
    [xmax, ymax],
    [xmin, ymax],
    [xmin, ymin],
  ]
  return corners.map((c) => dataToPixel(cal, c))
}

export function isCalibrationValid(cal: Calibration | null): boolean {
  if (!cal) return false
  try {
    validateCalibration(cal)
    return true
  } catch {
    return false
  }
}
