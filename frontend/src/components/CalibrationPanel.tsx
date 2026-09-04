import { useEffect, useMemo, useState } from 'react'
import type {
  Calibration,
  CoordsType,
  Scale,
  ThetaUnits,
  TransformModel,
} from '../types'
import {
  formatAxisValue,
  getAxisBounds,
  updateAxisBound,
  type AxisBoundKey,
} from '../lib/transform'
import { AXIS_PLACE_LABELS } from '../lib/calibration'
import {
  isCalibrationValid,
  resolutionAt,
  resolvedModel,
} from '../lib/transform2d'
import { formatModelLabel, formatResolution } from '../lib/axesChecker'

interface Props {
  calibration: Calibration | null
  axisPlaceStep: AxisBoundKey | null
  preciseMode: boolean
  scaleBarStep: 'a' | 'b' | null
  showAxesChecker: boolean
  onToggleAxesChecker: (show: boolean) => void
  onStartAxisPlacement: () => void
  onStartPrecisePlacement: () => void
  onStartScaleBarPlacement: () => void
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
  allowEmpty = false,
  onCommit,
}: {
  value: number | null
  logScale: boolean
  title?: string
  allowEmpty?: boolean
  onCommit: (value: number | null) => void
}) {
  const shown = value == null ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => {
    setDraft(value == null ? '' : String(value))
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
        if (allowEmpty && draft.trim() === '') {
          onCommit(null)
          return
        }
        if (shouldDeferBoundCommit(draft)) {
          setDraft(value == null ? '' : String(value))
          return
        }
        const n = Number(draft)
        if (!Number.isFinite(n) || (logScale && n <= 0)) {
          setDraft(value == null ? '' : String(value))
          return
        }
        setDraft(String(n))
        onCommit(n)
      }}
    />
  )
}

export function CalibrationPanel({
  calibration,
  axisPlaceStep,
  preciseMode,
  scaleBarStep,
  showAxesChecker,
  onToggleAxesChecker,
  onStartAxisPlacement,
  onStartPrecisePlacement,
  onStartScaleBarPlacement,
  onChange,
  onSave,
}: Props) {
  const coords: CoordsType = calibration?.coords_type ?? 'cartesian'
  const bounds = calibration && coords === 'cartesian' && !preciseMode ? getAxisBounds(calibration) : null

  const modelLabel = useMemo(() => {
    if (!calibration || !isCalibrationValid(calibration)) return 'invalid'
    try {
      return resolvedModel(calibration)
    } catch {
      return 'invalid'
    }
  }, [calibration])

  const resolutionText = useMemo(() => {
    if (!calibration || !isCalibrationValid(calibration)) return '—'
    try {
      const pixel =
        calibration.axis_points?.[0]?.pixel ??
        calibration.x.ref_points[0]?.pixel ??
        calibration.scale_bar?.pixel_a ??
        ([0, 0] as [number, number])
      return formatResolution(resolutionAt(calibration, pixel), coords)
    } catch {
      return '—'
    }
  }, [calibration, coords])

  const setCoords = (next: CoordsType) => {
    if (!calibration) return
    onChange({
      ...calibration,
      source: 'manual',
      coords_type: next,
      axis_points: next === 'cartesian' ? calibration.axis_points : calibration.axis_points,
    })
  }

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

  const placeTitle = axisPlaceStep
    ? `Click on the plot: ${AXIS_PLACE_LABELS[axisPlaceStep]}`
    : preciseMode
      ? 'Click the plot to add a precise axis point'
      : scaleBarStep
        ? `Click scale-bar ${scaleBarStep === 'a' ? 'start' : 'end'}`
        : 'Click four points on the plot: X min, X max, Y min, Y max'

  return (
    <section className="min-w-0 shrink rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Calibration</h3>
        <select
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          value={coords}
          onChange={(e) => setCoords(e.target.value as CoordsType)}
          title="Coordinate system"
        >
          <option value="cartesian">Cartesian</option>
          <option value="polar">Polar</option>
          <option value="map">Map</option>
        </select>
        {coords === 'cartesian' && (
          <button
            type="button"
            title={placeTitle}
            onClick={preciseMode ? onStartPrecisePlacement : onStartAxisPlacement}
            className={`shrink-0 rounded px-2 py-0.5 font-medium ${
              axisPlaceStep || preciseMode ? 'bg-amber-600 hover:bg-amber-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {axisPlaceStep ? `Placing ${axisPlaceStep.toUpperCase()}` : preciseMode ? 'Placing points' : 'Place bounds'}
          </button>
        )}
        {coords === 'cartesian' && (
          <label className="inline-flex items-center gap-1 text-slate-300">
            <input
              type="checkbox"
              checked={preciseMode}
              onChange={(e) => {
                if (e.target.checked) onStartPrecisePlacement()
                else onStartAxisPlacement()
              }}
            />
            Precise (3+ points)
          </label>
        )}
        {coords === 'map' && (
          <button
            type="button"
            onClick={onStartScaleBarPlacement}
            className={`shrink-0 rounded px-2 py-0.5 font-medium ${
              scaleBarStep ? 'bg-amber-600 hover:bg-amber-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {scaleBarStep ? `Bar ${scaleBarStep.toUpperCase()}` : 'Place scale bar'}
          </button>
        )}
        {coords === 'polar' && (
          <button
            type="button"
            onClick={onStartPrecisePlacement}
            className="shrink-0 rounded bg-sky-600 px-2 py-0.5 font-medium hover:bg-sky-500"
          >
            Place polar points
          </button>
        )}
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

      {calibration && coords === 'cartesian' && bounds && !preciseMode && (
        <div className="flex flex-col gap-0.5">
          {(['x', 'y'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <label className="inline-flex w-14 shrink-0 items-center gap-1 text-slate-300">
                {axis.toUpperCase()}
                <select
                  className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
                  value={calibration[axis].scale}
                  onChange={(e) => updateScale(axis, e.target.value as Scale)}
                >
                  <option value="linear">lin</option>
                  <option value="log">log</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                {axis === 'x' ? 'Xmin' : 'Ymin'}
                <BoundInput
                  value={bounds[axis === 'x' ? 'xmin' : 'ymin'].value}
                  logScale={calibration[axis].scale === 'log'}
                  title={formatAxisValue(bounds[axis === 'x' ? 'xmin' : 'ymin'].value)}
                  onCommit={(value) => {
                    if (value == null) return
                    commitBoundValue(axis === 'x' ? 'xmin' : 'ymin', value)
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                {axis === 'x' ? 'Xmax' : 'Ymax'}
                <BoundInput
                  value={bounds[axis === 'x' ? 'xmax' : 'ymax'].value}
                  logScale={calibration[axis].scale === 'log'}
                  title={formatAxisValue(bounds[axis === 'x' ? 'xmax' : 'ymax'].value)}
                  onCommit={(value) => {
                    if (value == null) return
                    commitBoundValue(axis === 'x' ? 'xmax' : 'ymax', value)
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {calibration && coords === 'cartesian' && preciseMode && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            Model
            <select
              className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.model ?? 'auto'}
              onChange={(e) => onChange({ ...calibration, source: 'manual', model: e.target.value as TransformModel })}
            >
              <option value="auto">auto</option>
              <option value="orthogonal">orthogonal</option>
              <option value="affine">affine</option>
              <option value="projective">projective</option>
            </select>
          </label>
          <p>{(calibration.axis_points ?? []).length} axis points — click the plot, then type X and/or Y</p>
          {(calibration.axis_points ?? []).map((pt, i) => (
            <div key={pt.id} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-slate-400">#{i + 1}</span>
              <label className="inline-flex items-center gap-1 text-slate-300">
                X
                <BoundInput
                  value={pt.x_value ?? null}
                  logScale={calibration.x.scale === 'log'}
                  title="X"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, x_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                Y
                <BoundInput
                  value={pt.y_value ?? null}
                  logScale={calibration.y.scale === 'log'}
                  title="Y"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, y_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <button
                type="button"
                className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
                onClick={() =>
                  onChange({
                    ...calibration,
                    source: 'manual',
                    axis_points: (calibration.axis_points ?? []).filter((p) => p.id !== pt.id),
                  })
                }
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {calibration && coords === 'polar' && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            θ units
            <select
              className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.theta_units ?? 'degrees'}
              onChange={(e) =>
                onChange({ ...calibration, source: 'manual', theta_units: e.target.value as ThetaUnits })
              }
            >
              <option value="degrees">degrees</option>
              <option value="radians">radians</option>
              <option value="gradians">gradians</option>
              <option value="turns">turns</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Radius
            <select
              className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.y.scale}
              onChange={(e) => updateScale('y', e.target.value as Scale)}
            >
              <option value="linear">lin</option>
              <option value="log">log</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            Origin R
            <BoundInput
              value={calibration.origin_radius ?? 0}
              logScale={false}
              onCommit={(value) => {
                if (value == null) return
                onChange({ ...calibration, source: 'manual', origin_radius: value })
              }}
            />
          </label>
          <p>Click the plot to place a point, then type θ and R. {(calibration.axis_points ?? []).length} placed.</p>
          {(calibration.axis_points ?? []).map((pt, i) => (
            <div key={pt.id} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-slate-400">#{i + 1}</span>
              <label className="inline-flex items-center gap-1 text-slate-300">
                θ
                <BoundInput
                  value={pt.x_value ?? null}
                  logScale={false}
                  title="θ"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, x_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                R
                <BoundInput
                  value={pt.y_value ?? null}
                  logScale={calibration.y.scale === 'log'}
                  title="R"
                  allowEmpty
                  onCommit={(value) => {
                    const next = (calibration.axis_points ?? []).map((p) =>
                      p.id === pt.id ? { ...p, y_value: value } : p,
                    )
                    onChange({ ...calibration, axis_points: next, source: 'manual' })
                  }}
                />
              </label>
              <button
                type="button"
                className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
                onClick={() =>
                  onChange({
                    ...calibration,
                    source: 'manual',
                    axis_points: (calibration.axis_points ?? []).filter((p) => p.id !== pt.id),
                  })
                }
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {calibration && coords === 'map' && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            Length
            <BoundInput
              value={calibration.scale_bar?.length ?? 1}
              logScale={false}
              onCommit={(value) => {
                if (value == null) return
                onChange({
                  ...calibration,
                  source: 'manual',
                  scale_bar: {
                    pixel_a: calibration.scale_bar?.pixel_a ?? [0, 0],
                    pixel_b: calibration.scale_bar?.pixel_b ?? [0, 0],
                    length: value,
                    units: calibration.scale_bar?.units ?? '',
                  },
                })
              }}
            />
          </label>
          <label className="inline-flex items-center gap-1">
            Units
            <input
              className="w-[4.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.scale_bar?.units ?? ''}
              onChange={(e) =>
                onChange({
                  ...calibration,
                  source: 'manual',
                  scale_bar: {
                    pixel_a: calibration.scale_bar?.pixel_a ?? [0, 0],
                    pixel_b: calibration.scale_bar?.pixel_b ?? [0, 0],
                    length: calibration.scale_bar?.length ?? 1,
                    units: e.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-slate-400">
        <span>model {formatModelLabel(modelLabel)}</span>
        <span>{resolutionText}</span>
        <label className="ml-auto inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={showAxesChecker}
            onChange={(e) => onToggleAxesChecker(e.target.checked)}
          />
          Axes checker
        </label>
      </div>
    </section>
  )
}
