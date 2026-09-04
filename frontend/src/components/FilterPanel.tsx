import type { ColorFilter, FilterMode, GridGeometrySettings } from '../types'
import { displayMax, displayToNorm, normToDisplay } from '../lib/colorFilter'

export type MaskView = 'none' | 'image' | 'mask'

const MODES: FilterMode[] = ['intensity', 'foreground', 'hue', 'saturation', 'value']

interface Props {
  filter: ColorFilter | null
  disabled: boolean
  busy: boolean
  picking: boolean
  maskView: MaskView
  grid: GridGeometrySettings | null
  onFilterChange: (next: ColorFilter) => void
  onPickColor: () => void
  onMaskViewChange: (view: MaskView) => void
  onToggleGrid: (enabled: boolean) => void
}

function defaultFilter(): ColorFilter {
  return { mode: 'intensity', low: 0, high: 0.4, sample_color: null, remove_grid: false }
}

export function FilterPanel({
  filter,
  disabled,
  busy,
  picking,
  maskView,
  grid,
  onFilterChange,
  onPickColor,
  onMaskViewChange,
  onToggleGrid,
}: Props) {
  const flt = filter ?? defaultFilter()
  const max = displayMax(flt.mode)
  const lowDisp = Math.round(normToDisplay(flt.mode, flt.low))
  const highDisp = Math.round(normToDisplay(flt.mode, flt.high))
  const gridSummary = grid
    ? `x ${grid.count_x}×${grid.step_x.toFixed(1)}px @ ${grid.start_x.toFixed(0)} · y ${grid.count_y}×${grid.step_y.toFixed(1)}px @ ${grid.start_y.toFixed(0)}`
    : 'no grid detected'

  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Filter</h3>
        <select
          disabled={disabled || busy}
          value={flt.mode}
          onChange={(e) => onFilterChange({ ...flt, mode: e.target.value as FilterMode })}
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-slate-200"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onPickColor}
          className={`shrink-0 rounded px-2 py-0.5 font-medium disabled:opacity-50 ${
            picking ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          {picking ? 'Click plot…' : 'Pick colour'}
        </button>
        <div className="flex shrink-0 rounded border border-slate-600 text-[10px]">
          {(['none', 'image', 'mask'] as MaskView[]).map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onMaskViewChange(v)}
              className={`px-2 py-0.5 ${
                maskView === v ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-300">
          <input
            type="checkbox"
            disabled={disabled || busy}
            checked={!!flt.remove_grid}
            onChange={(e) => onToggleGrid(e.target.checked)}
          />
          Remove grid
        </label>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-slate-300">
        <span className="tabular-nums">
          {lowDisp}–{highDisp} / {max}
        </span>
        <input
          type="range"
          min={0}
          max={max}
          value={lowDisp}
          disabled={disabled || busy}
          onChange={(e) =>
            onFilterChange({ ...flt, low: displayToNorm(flt.mode, Number(e.target.value)) })
          }
        />
        <input
          type="range"
          min={0}
          max={max}
          value={highDisp}
          disabled={disabled || busy}
          onChange={(e) =>
            onFilterChange({ ...flt, high: displayToNorm(flt.mode, Number(e.target.value)) })
          }
        />
        {flt.sample_color && (
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-slate-500" style={{ background: flt.sample_color }} />
            {flt.sample_color}
          </span>
        )}
      </div>
      <p className="text-slate-400">{flt.remove_grid ? gridSummary : 'Grid removal off'}</p>
    </section>
  )
}
