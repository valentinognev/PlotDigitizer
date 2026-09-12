import { useMemo, useState } from 'react'
import type { Calibration, Curve } from '../types'
import {
  formatTableCell,
  rowsFromCurves,
  sortRows,
  tableToClipboardText,
  type NumberStyle,
} from '../lib/dataTable'

interface Props {
  curves: Curve[]
  calibration: Calibration | null
  calibrations?: Calibration[]
  onToast?: (message: string) => void
}

const STYLES: { value: NumberStyle; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'precision', label: 'Precision' },
  { value: 'exponential', label: 'Exponential' },
]

const controlClass =
  'rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-slate-200 disabled:cursor-not-allowed disabled:opacity-50'

/** Precision needs 1–21; Fixed/Exponential/Ignore may use 0. */
export function formatDigits(digits: number, style: NumberStyle): number {
  if (style !== 'precision') return digits
  return Math.min(21, Math.max(1, digits))
}

export function DataTablePanel({ curves, calibration, calibrations, onToast }: Props) {
  const [sortKey, setSortKey] = useState<'a' | 'b'>('a')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [digits, setDigits] = useState(6)
  const [style, setStyle] = useState<NumberStyle>('ignore')

  const rawRows = useMemo(() => {
    const list = calibrations?.length ? calibrations : calibration ? [calibration] : []
    return rowsFromCurves(curves, list, calibration)
  }, [curves, calibrations, calibration])

  const rows = useMemo(
    () => sortRows(rawRows, sortKey, sortOrder),
    [rawRows, sortKey, sortOrder],
  )

  const aLabel = rows[0]?.aLabel ?? 'x'
  const bLabel = rows[0]?.bLabel ?? 'y'
  const empty = rows.length === 0
  const shownDigits = formatDigits(digits, style)

  const handleCopy = async () => {
    if (empty) return
    const text = tableToClipboardText(rows, '\t', { digits: shownDigits, style })
    try {
      await navigator.clipboard.writeText(text)
      onToast?.(`Copied ${rows.length} rows`)
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  return (
    <section className="shrink-0 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <h3 className="shrink-0 font-semibold text-slate-200">View data</h3>
        <label className="flex items-center gap-1 text-slate-400">
          Sort
          <select
            disabled={empty}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as 'a' | 'b')}
            className={controlClass}
          >
            <option value="a">{aLabel}</option>
            <option value="b">{bLabel}</option>
          </select>
        </label>
        <select
          disabled={empty}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
          className={controlClass}
          aria-label="Sort order"
        >
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
        <label className="flex items-center gap-1 text-slate-400">
          Digits
          <input
            type="number"
            min={0}
            max={20}
            disabled={empty}
            value={digits}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) setDigits(Math.min(20, Math.max(0, Math.round(n))))
            }}
            className={`input-no-spinner w-12 ${controlClass}`}
          />
        </label>
        <select
          disabled={empty}
          value={style}
          onChange={(e) => setStyle(e.target.value as NumberStyle)}
          className={controlClass}
          aria-label="Number style"
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={empty}
          onClick={() => void handleCopy()}
          className="rounded bg-slate-600 px-2 py-0.5 font-medium text-slate-100 hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy
        </button>
      </div>
      <div className="max-h-48 overflow-auto">
        {empty ? (
          <p className="px-1 py-2 text-slate-400">
            No data — set valid calibration and show points.
          </p>
        ) : (
          <table className="w-full border-collapse text-left tabular-nums">
            <thead className="sticky top-0 bg-slate-800">
              <tr className="text-slate-400">
                <th className="px-1 py-0.5 font-medium">curve</th>
                <th className="px-1 py-0.5 font-medium">{aLabel}</th>
                <th className="px-1 py-0.5 font-medium">{bLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.curveId}:${row.pointId}`} className="text-slate-200">
                  <td className="px-1 py-0.5">{row.curveLabel}</td>
                  <td className="px-1 py-0.5">{formatTableCell(row.a, row.aScale, shownDigits, style, row.aText)}</td>
                  <td className="px-1 py-0.5">{formatTableCell(row.b, row.bScale, shownDigits, style, row.bText)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
