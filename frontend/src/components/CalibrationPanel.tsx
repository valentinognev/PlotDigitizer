import { useEffect, useMemo, useState } from 'react'
import type {
  Calibration,
  CoordsType,
  Scale,
  ThetaUnits,
  TransformModel,
} from '../types'
import {
  formatCalibrationIssue,
  getAxisBounds,
  updateAxisBound,
  type AxisBoundKey,
} from '../lib/transform'
import { AXIS_PLACE_LABELS } from '../lib/calibration'
import {
  formatBoundValue,
  parseBoundValue,
  shouldDeferBoundCommit,
  shouldLiveCommitBound,
} from '../lib/dates'
import { resolutionAt, resolvedModel } from '../lib/transform2d'
import { formatModelLabel, formatResolution } from '../lib/axesChecker'

interface Props {
  calibration: Calibration | null
  calibrations: Calibration[]
  axisPlaceStep: AxisBoundKey | null
  preciseMode: boolean
  scaleBarStep: 'a' | 'b' | null
  showAxesChecker: boolean
  onToggleAxesChecker: (show: boolean) => void
  onStartAxisPlacement: () => void
  onStartPrecisePlacement: () => void
  onStartScaleBarPlacement: () => void
  onChange: (cal: Calibration) => void
  onSelect: (cal: Calibration) => void
  onAdd: () => void
  onDelete: () => void
  onSave: () => void
}

function BoundInput({
  value,
  scale,
  title,
  allowEmpty = false,
  onCommit,
}: {
  value: number | null
  scale: Scale
  title?: string
  allowEmpty?: boolean
  onCommit: (value: number | null) => void
}) {
  const dateScale = scale === 'date'
  const logScale = scale === 'log'
  const shown = formatBoundValue(value, scale)
  const [draft, setDraft] = useState(shown)
  useEffect(() => {
    setDraft(formatBoundValue(value, scale))
  }, [value, scale])
  const invalidLog = logScale && value != null && value <= 0
  return (
    <input
      type="text"
      inputMode={dateScale ? 'text' : 'decimal'}
      title={invalidLog ? 'Enter a value greater than 0 — log scale cannot use 0' : title}
      className={`input-no-spinner ${dateScale ? 'w-[9.5rem]' : 'w-[4.5rem]'} rounded border bg-slate-900 px-1 py-0.5 ${
        invalidLog ? 'border-amber-500 text-amber-200' : 'border-slate-600'
      }`}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (!shouldLiveCommitBound(raw, scale)) return
        try {
          onCommit(parseBoundValue(raw, scale))
        } catch {
          // keep draft until blur
        }
      }}
      onBlur={() => {
        if (allowEmpty && draft.trim() === '') {
          onCommit(null)
          return
        }
        if (!dateScale && shouldDeferBoundCommit(draft)) {
          setDraft(formatBoundValue(value, scale))
          return
        }
        try {
          const n = parseBoundValue(draft, scale)
          setDraft(formatBoundValue(n, scale))
          onCommit(n)
        } catch {
          setDraft(formatBoundValue(value, scale))
        }
      }}
    />
  )
}

export function CalibrationPanel({
  calibration,
  calibrations,
  axisPlaceStep,
  preciseMode,
  scaleBarStep,
  showAxesChecker,
  onToggleAxesChecker,
  onStartAxisPlacement,
  onStartPrecisePlacement,
  onStartScaleBarPlacement,
  onChange,
  onSelect,
  onAdd,
  onDelete,
  onSave,
}: Props) {
  const coords: CoordsType = calibration?.coords_type ?? 'cartesian'
  const bounds = calibration && coords === 'cartesian' && !preciseMode ? getAxisBounds(calibration) : null

  const issue = useMemo(() => formatCalibrationIssue(calibration), [calibration])

  const modelLabel = useMemo(() => {
    if (!calibration || issue) return 'invalid'
    try {
      return resolvedModel(calibration)
    } catch {
      return 'invalid'
    }
  }, [calibration, issue])

  const resolutionText = useMemo(() => {
    if (!calibration || issue) return '—'
    try {
      const pixel =
        calibration.axis_points?.[0]?.pixel ??
        calibration.x.ref_points[0]?.pixel ??
        calibration.y.ref_points[0]?.pixel ??
        calibration.scale_bar?.pixel_a ??
        ([0, 0] as [number, number])
      return formatResolution(resolutionAt(calibration, pixel), coords)
    } catch {
      return '—'
    }
  }, [calibration, coords, issue])

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
        ? coords === 'bar'
          ? `Click value-axis ${scaleBarStep === 'a' ? 'P1' : 'P2'}`
          : `Click scale-bar ${scaleBarStep === 'a' ? 'start' : 'end'}`
        : 'Click four points on the plot: X min, X max, Y min, Y max'

  return (
    <section className="min-w-0 max-w-full flex-1 basis-72 overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[11px]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="shrink-0 font-semibold text-slate-200">Calibration</h3>
        {calibrations.length > 0 && (
          <select
            className="max-w-[8rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            value={calibration?.id ?? calibrations[0]?.id ?? ''}
            onChange={(e) => {
              const next = calibrations.find((cal) => cal.id === e.target.value)
              if (next) onSelect(next)
            }}
            title="Named axes"
          >
            {calibrations.map((cal, i) => (
              <option key={cal.id ?? `cal-${i}`} value={cal.id ?? ''}>
                {cal.name?.trim() || 'Axes'}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500"
        >
          Add
        </button>
        <button
          type="button"
          disabled={calibrations.length <= 1}
          title={calibrations.length <= 1 ? 'Keep at least one axes set' : 'Delete this axes set'}
          onClick={onDelete}
          className="shrink-0 rounded bg-slate-600 px-2 py-0.5 font-medium hover:bg-slate-500 disabled:opacity-50"
        >
          Delete
        </button>
        {calibration && (
          <label className="inline-flex items-center gap-1 text-slate-300">
            Name
            <input
              className="w-[6.5rem] rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              value={calibration.name ?? 'Axes'}
              onChange={(e) => onChange({ ...calibration, name: e.target.value })}
            />
          </label>
        )}
        <select
          className="rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          value={coords}
          onChange={(e) => setCoords(e.target.value as CoordsType)}
          title="Coordinate system"
        >
          <option value="cartesian">Cartesian</option>
          <option value="polar">Polar</option>
          <option value="map">Map</option>
          <option value="bar">Bar</option>
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
        {coords === 'bar' && (
          <button
            type="button"
            title={placeTitle}
            onClick={onStartScaleBarPlacement}
            className={`shrink-0 rounded px-2 py-0.5 font-medium ${
              scaleBarStep ? 'bg-amber-600 hover:bg-amber-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {scaleBarStep ? `P${scaleBarStep === 'a' ? '1' : '2'}` : 'Place value axis'}
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
            <div key={axis} className="flex flex-wrap items-center gap-2">
              <label className="inline-flex w-[4.75rem] shrink-0 items-center gap-1 text-slate-300">
                {axis.toUpperCase()}
                <select
                  className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
                  value={calibration[axis].scale}
                  onChange={(e) => updateScale(axis, e.target.value as Scale)}
                >
                  <option value="linear">lin</option>
                  <option value="log">log</option>
                  <option value="date">date</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1 text-slate-300">
                {axis === 'x' ? 'Xmin' : 'Ymin'}
                <BoundInput
                  value={bounds[axis === 'x' ? 'xmin' : 'ymin'].value}
                  scale={calibration[axis].scale}
                  title={formatBoundValue(bounds[axis === 'x' ? 'xmin' : 'ymin'].value, calibration[axis].scale)}
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
                  scale={calibration[axis].scale}
                  title={formatBoundValue(bounds[axis === 'x' ? 'xmax' : 'ymax'].value, calibration[axis].scale)}
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
            <div key={pt.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-slate-400">#{i + 1}</span>
              <label className="inline-flex items-center gap-1 text-slate-300">
                X
                <BoundInput
                  value={pt.x_value ?? null}
                  scale={calibration.x.scale}
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
                  scale={calibration.y.scale}
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
              scale="linear"
              onCommit={(value) => {
                if (value == null) return
                onChange({ ...calibration, source: 'manual', origin_radius: value })
              }}
            />
          </label>
          <p>Click the plot to place a point, then type θ and R. {(calibration.axis_points ?? []).length} placed.</p>
          {(calibration.axis_points ?? []).map((pt, i) => (
            <div key={pt.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-slate-400">#{i + 1}</span>
              <label className="inline-flex items-center gap-1 text-slate-300">
                θ
                <BoundInput
                  value={pt.x_value ?? null}
                  scale="linear"
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
                  scale={calibration.y.scale}
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
              scale="linear"
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

      {calibration && coords === 'bar' && (
        <div className="flex flex-col gap-0.5 text-slate-300">
          <label className="inline-flex items-center gap-1">
            Scale
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
            v1
            <BoundInput
              value={calibration.y.ref_points[0]?.value ?? 0}
              scale={calibration.y.scale}
              title="Value at P1"
              onCommit={(value) => {
                if (value == null) return
                const refs = [...calibration.y.ref_points]
                if (!refs[0]) refs[0] = { pixel: [0, 0], value }
                else refs[0] = { ...refs[0], value }
                onChange({ ...calibration, source: 'manual', y: { ...calibration.y, ref_points: refs } })
              }}
            />
          </label>
          <label className="inline-flex items-center gap-1">
            v2
            <BoundInput
              value={calibration.y.ref_points[1]?.value ?? 1}
              scale={calibration.y.scale}
              title="Value at P2"
              onCommit={(value) => {
                if (value == null) return
                const refs = [...calibration.y.ref_points]
                if (!refs[1]) refs[1] = { pixel: [0, 0], value }
                else refs[1] = { ...refs[1], value }
                onChange({ ...calibration, source: 'manual', y: { ...calibration.y, ref_points: refs } })
              }}
            />
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={calibration.bar_horizontal ?? false}
              onChange={(e) =>
                onChange({ ...calibration, source: 'manual', bar_horizontal: e.target.checked })
              }
            />
            Rotated/horizontal
          </label>
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-400">
        <span className={issue ? 'text-amber-300' : undefined}>
          {issue ? issue.message : `model ${formatModelLabel(modelLabel)}`}
        </span>
        <span className={issue ? 'text-amber-300/80' : undefined}>{issue?.hint ?? resolutionText}</span>
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
