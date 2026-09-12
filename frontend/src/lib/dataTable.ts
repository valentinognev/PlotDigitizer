import type { Calibration, Curve, Scale } from '../types'
import { formatBoundValue } from './dates'
import { calibrationForCurve } from './previewChart'
import { pixelToData } from './transform2d'

export type NumberStyle = 'ignore' | 'fixed' | 'precision' | 'exponential'

export type DataTableRow = {
  curveId: string
  curveLabel: string
  pointId: string
  a: number | string
  b: number
  aLabel: string
  bLabel: string
  aScale?: Scale
  bScale?: Scale
  aText?: string
  bText?: string
}

function axisLabels(cal: Calibration): { aLabel: string; bLabel: string } {
  if (cal.coords_type === 'polar') return { aLabel: 'theta', bLabel: 'R' }
  if (cal.coords_type === 'bar') return { aLabel: 'label', bLabel: 'value' }
  return { aLabel: 'x', bLabel: 'y' }
}

function dateText(value: number, scale: Scale | undefined): string | undefined {
  if (scale !== 'date') return undefined
  return formatBoundValue(value, 'date')
}

export function rowsFromCurves(
  curves: Curve[],
  calibrations: Calibration[],
  fallback: Calibration | null = null,
): DataTableRow[] {
  const rows: DataTableRow[] = []
  for (const curve of curves) {
    if (!curve.visible) continue
    const cal = calibrationForCurve(curve, calibrations, fallback)
    if (!cal) continue
    const { aLabel, bLabel } = axisLabels(cal)
    for (const point of curve.points) {
      try {
        const [x, y] = pixelToData(cal, point.pixel)
        if (cal.coords_type === 'bar') {
          rows.push({
            curveId: curve.id,
            curveLabel: curve.label,
            pointId: point.id,
            a: point.label || '',
            b: x,
            aLabel,
            bLabel,
            bScale: cal.y.scale,
            bText: dateText(x, cal.y.scale),
          })
          continue
        }
        rows.push({
          curveId: curve.id,
          curveLabel: curve.label,
          pointId: point.id,
          a: x,
          b: y,
          aLabel,
          bLabel,
          aScale: cal.x.scale,
          bScale: cal.y.scale,
          aText: dateText(x, cal.x.scale),
          bText: dateText(y, cal.y.scale),
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
  return [...rows].sort((left, right) => {
    const lv = left[key]
    const rv = right[key]
    if (typeof lv === 'string' || typeof rv === 'string') {
      return String(lv).localeCompare(String(rv)) * sign
    }
    return (lv - rv) * sign
  })
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

export function formatTableCell(
  value: number | string,
  scale: Scale | undefined,
  digits: number,
  style: NumberStyle,
  text?: string,
): string {
  if (typeof value === 'string') return value
  if (text) return text
  if (scale === 'date') return formatBoundValue(value, 'date')
  return formatNumber(value, digits, style)
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
    const a = formatTableCell(row.a, row.aScale, digits, style, row.aText)
    const b = formatTableCell(row.b, row.bScale, digits, style, row.bText)
    lines.push(`${row.curveLabel}${sep}${a}${sep}${b}`)
  }
  return lines.join('\n')
}
