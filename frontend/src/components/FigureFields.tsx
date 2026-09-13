import type { FigureMeta } from '../types'
import { FIGURE_FIELD_KEYS, FIGURE_FIELD_LABELS } from '../lib/figureFields'

interface Props {
  figure: FigureMeta
  disabled: boolean
  onFigureChange: (figure: FigureMeta) => void
}

export function FigureFields({ figure, disabled, onFigureChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {FIGURE_FIELD_KEYS.map((key) => (
        <label key={key} className="flex flex-col gap-0.5 text-[10px] text-slate-400">
          {FIGURE_FIELD_LABELS[key]}
          <input
            type="text"
            disabled={disabled}
            className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            value={figure[key]}
            onChange={(e) => onFigureChange({ ...figure, [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  )
}
