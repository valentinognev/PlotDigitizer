import { useEffect, useState } from 'react'
import type { Calibration, Scale } from '../types'
import {
  formatAxisValue,
  getAxisBounds,
  updateAxisBound,
  type AxisBoundKey,
} from '../lib/transform'
import { AXIS_PLACE_LABELS } from '../lib/calibration'

interface Props {
  calibration: Calibration | null
  axisPlaceStep: AxisBoundKey | null
  onStartAxisPlacement: () => void
  onChange: (cal: Calibration) => void
  onSave: () => void
}

function shouldDeferBoundCommit(raw: string): boolean {
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return true
  if (raw.endsWith('.')) return true
  if (/^-0$/.test(raw)) return true
  return false
}

function BoundInput({
  value,
  logScale,
  title,
  onCommit,
}: {
  value: number
  logScale: boolean
  title?: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const tryCommit = (raw: string) => {
    if (shouldDeferBoundCommit(raw)) return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    if (logScale && n <= 0) return
    onCommit(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      title={title}
      className="input-no-spinner w-[4.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        tryCommit(raw)
      }}
      onBlur={() => {
        if (shouldDeferBoundCommit(draft)) {
          setDraft(String(value))
          return
        }
        const n = Number(draft)
        if (!Number.isFinite(n) || (logScale && n <= 0)) {
          setDraft(String(value))
          return
        }
        setDraft(String(n))
        onCommit(n)
      }}
    />
  )
}

function AxisRow({
  axis,
  scale,
  minKey,
  maxKey,
  minLabel,
  maxLabel,
  bounds,
  onScaleChange,
  onBoundCommit,
}: {
  axis: 'x' | 'y'
  scale: Scale
  minKey: AxisBoundKey
  maxKey: AxisBoundKey
  minLabel: string
  maxLabel: string
  bounds: NonNullable<ReturnType<typeof getAxisBounds>>
  onScaleChange: (scale: Scale) => void
  onBoundCommit: (key: AxisBoundKey, value: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="inline-flex w-14 shrink-0 items-center gap-1 text-slate-300">
        {axis.toUpperCase()}
        <select
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          value={scale}
          onChange={(e) => onScaleChange(e.target.value as Scale)}
        >
          <option value="linear">lin</option>
          <option value="log">log</option>
        </select>
      </label>
      <label className="inline-flex items-center gap-1 text-slate-300">
        {minLabel}
        <BoundInput
          value={bounds[minKey].value}
          logScale={scale === 'log'}
          title={formatAxisValue(bounds[minKey].value)}
          onCommit={(value) => onBoundCommit(minKey, value)}
        />
      </label>
      <label className="inline-flex items-center gap-1 text-slate-300">
        {maxLabel}
        <BoundInput
          value={bounds[maxKey].value}
          logScale={scale === 'log'}
          title={formatAxisValue(bounds[maxKey].value)}
          onCommit={(value) => onBoundCommit(maxKey, value)}
        />
      </label>
    </div>
  )
}

export function CalibrationPanel({
  calibration,
  axisPlaceStep,
  onStartAxisPlacement,
  onChange,
  onSave,
}: Props) {
  const updateScale = (axis: 'x' | 'y', scale: Scale) => {
    if (!calibration) return
    onChange({
      ...calibration,
      source: 'manual',
      [axis]: { ...calibration[axis], scale },
    })
  }

  const commitBoundValue = (key: AxisBoundKey, value: number) => {
    if (!calibration) return
    if (calibration[key.startsWith('x') ? 'x' : 'y'].scale === 'log' && value <= 0) return
    onChange(updateAxisBound(calibration, key, { value }))
  }

  const bounds = calibration ? getAxisBounds(calibration) : null
  const placeTitle = axisPlaceStep
    ? `Click on the plot: ${AXIS_PLACE_LABELS[axisPlaceStep]}`
    : 'Click four points on the plot: X min, X max, Y min, Y max'

  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Calibration</h3>
        <button
          type="button"
          title={placeTitle}
          onClick={onStartAxisPlacement}
          className={`shrink-0 rounded px-2 py-0.5 font-medium ${
            axisPlaceStep
              ? 'bg-amber-600 hover:bg-amber-500'
              : 'bg-sky-600 hover:bg-sky-500'
          }`}
        >
          {axisPlaceStep ? `Placing ${axisPlaceStep.toUpperCase()}` : 'Place bounds'}
        </button>
        {calibration && (
          <button
            type="button"
            onClick={onSave}
            className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
          >
            Save
          </button>
        )}
      </div>

      {calibration && bounds && (
        <div className="flex flex-col gap-0.5">
          <AxisRow
            axis="x"
            scale={calibration.x.scale}
            minKey="xmin"
            maxKey="xmax"
            minLabel="Xmin"
            maxLabel="Xmax"
            bounds={bounds}
            onScaleChange={(scale) => updateScale('x', scale)}
            onBoundCommit={commitBoundValue}
          />
          <AxisRow
            axis="y"
            scale={calibration.y.scale}
            minKey="ymin"
            maxKey="ymax"
            minLabel="Ymin"
            maxLabel="Ymax"
            bounds={bounds}
            onScaleChange={(scale) => updateScale('y', scale)}
            onBoundCommit={commitBoundValue}
          />
        </div>
      )}
    </section>
  )
}
