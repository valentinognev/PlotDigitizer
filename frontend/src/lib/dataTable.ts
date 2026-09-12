import type { Calibration, Curve, FigureMeta } from '../types'
import { pixelToData } from './transform2d'

export type NumberStyle = 'ignore' | 'fixed' | 'precision' | 'exponential'

export type DataTableRow = {
  curveId: string
  curveLabel: string
  pointId: string
  a: number
  b: number
  aLabel: string
  bLabel: string
}

function axisLabels(cal: Calibration): { aLabel: string; bLabel: string } {
  if (cal.coords_type === 'polar') return { aLabel: 'theta', bLabel: 'R' }
  return { aLabel: 'x', bLabel: 'y' }
}

export function rowsFromCurves(
  curves: Curve[],
  calibration: Calibration,
  _figure?: FigureMeta,
): DataTableRow[] {
  const { aLabel, bLabel } = axisLabels(calibration)
  const rows: DataTableRow[] = []
  for (const curve of curves) {
    if (!curve.visible) continue
    for (const point of curve.points) {
      try {
        const [a, b] = pixelToData(calibration, point.pixel)
        rows.push({
          curveId: curve.id,
          curveLabel: curve.label,
          pointId: point.id,
          a,
          b,
          aLabel,
          bLabel,
        })
      } catch {
        // invalid calibration / unmappable pixel
      }
    }
  }
  return rows
}

export function sortRows(
  rows: DataTableRow[],
  key: 'a' | 'b',
  order: 'asc' | 'desc',
): DataTableRow[] {
  const sign = order === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => (left[key] - right[key]) * sign)
}

export function formatNumber(n: number, digits: number, style: NumberStyle): string {
  const formatted =
    style === 'fixed'
      ? n.toFixed(digits)
      : style === 'exponential'
        ? n.toExponential(digits)
        : style === 'precision'
          ? n.toPrecision(digits)
          : n.toFixed(digits)
  if (style !== 'ignore') return formatted
  const raw = String(n)
  return raw.length < formatted.length ? raw : formatted
}

export function tableToClipboardText(
  rows: DataTableRow[],
  sep: string,
  fmt?: { digits: number; style: NumberStyle },
): string {
  const digits = fmt?.digits ?? 6
  const style = fmt?.style ?? 'ignore'
  const aLabel = rows[0]?.aLabel ?? 'x'
  const bLabel = rows[0]?.bLabel ?? 'y'
  const lines = [`curve${sep}${aLabel}${sep}${bLabel}`]
  for (const row of rows) {
    lines.push(
      `${row.curveLabel}${sep}${formatNumber(row.a, digits, style)}${sep}${formatNumber(row.b, digits, style)}`,
    )
  }
  return lines.join('\n')
}
