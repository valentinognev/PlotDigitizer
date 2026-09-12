import { useEffect, useMemo, useState } from 'react'
import { formatSeparation } from '../lib/segments'
import { defaultXStepFromCalibration } from '../lib/xStepDefaults'
import type { Calibration, CanvasMode } from '../types'

interface Props {
  busy: boolean
  disabled: boolean
  active: boolean
  pointSeparation: number
  minSegmentLength: number
  fillCorners: boolean
  onPointSeparationChange: (n: number) => void
  onMinSegmentLengthChange: (n: number) => void
  onFillCornersChange: (v: boolean) => void
  onEnterSegmentFill: () => void
  maxPointSize: number
  onMaxPointSizeChange: (n: number) => void
  canvasMode: CanvasMode
  onCanvasModeChange: (mode: CanvasMode) => void
  acceptedCount: number
  onApplyAccepted: () => void
  onClearCandidates: () => void
  calibration: Calibration | null
  onClearRegion: () => void
  onAveragingWindow: (dx: number, dy: number) => void
  onSampleXStep: (xmin: number, xmax: number, delx: number) => void
}

function modeButtonClass(on: boolean) {
  return `rounded px-2 py-1 text-[11px] ${
    on ? 'bg-sky-600 hover:bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'
  }`
}

export function AutoDigitizePanel({
  busy,
  disabled,
  active,
  pointSeparation,
  minSegmentLength,
  fillCorners,
  onPointSeparationChange,
  onMinSegmentLengthChange,
  onFillCornersChange,
  onEnterSegmentFill,
  maxPointSize,
  onMaxPointSizeChange,
  canvasMode,
  onCanvasModeChange,
  acceptedCount,
  onApplyAccepted,
  onClearCandidates,
  calibration,
  onClearRegion,
  onAveragingWindow,
  onSampleXStep,
}: Props) {
  const xStepDefaults = useMemo(() => defaultXStepFromCalibration(calibration), [calibration])
  const [dx, setDx] = useState(10)
  const [dy, setDy] = useState(10)
  const [xmin, setXmin] = useState(0)
  const [xmax, setXmax] = useState(1)
  const [delx, setDelx] = useState(0.1)

  useEffect(() => {
    if (!xStepDefaults) return
    setXmin(xStepDefaults.xmin)
    setXmax(xStepDefaults.xmax)
    setDelx(xStepDefaults.delx)
  }, [xStepDefaults])

  const toggleMask = (mode: 'mask-box' | 'mask-pen' | 'mask-erase') => {
    onCanvasModeChange(canvasMode === mode ? 'select' : mode)
  }

  const sampleReady =
    Number.isFinite(xmin) && Number.isFinite(xmax) && Number.isFinite(delx) && delx !== 0

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Auto digitize</h3>
      <div className="flex flex-col gap-2 text-[11px] text-slate-300">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => toggleMask('mask-box')}
            className={modeButtonClass(canvasMode === 'mask-box')}
          >Box</button>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => toggleMask('mask-pen')}
            className={modeButtonClass(canvasMode === 'mask-pen')}
          >Pen</button>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => toggleMask('mask-erase')}
            className={modeButtonClass(canvasMode === 'mask-erase')}
          >Erase</button>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={onClearRegion}
            className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500 disabled:opacity-50"
          >
            Clear region
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            ΔX
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={dx}
              disabled={busy}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n > 0) setDx(n)
              }}
              className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            />
            px
          </label>
          <label className="flex items-center gap-1">
            ΔY
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={dy}
              disabled={busy}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n > 0) setDy(n)
              }}
              className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            />
            px
          </label>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => onAveragingWindow(dx, dy)}
            className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500 disabled:opacity-50"
          >
            Averaging window
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span>Δx (data)</span>
          <div className="flex flex-wrap items-center gap-1">
            <label className="flex items-center gap-1">
              xmin
              <input
                type="number"
                value={xmin}
                disabled={busy}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n)) setXmin(n)
                }}
                className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              />
            </label>
            <label className="flex items-center gap-1">
              xmax
              <input
                type="number"
                value={xmax}
                disabled={busy}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n)) setXmax(n)
                }}
                className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              />
            </label>
            <label className="flex items-center gap-1">
              delx
              <input
                type="number"
                value={delx}
                disabled={busy}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n !== 0) setDelx(n)
                }}
                className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
              />
            </label>
            <button
              type="button"
              disabled={busy || disabled || !sampleReady || !xStepDefaults}
              onClick={() => onSampleXStep(xmin, xmax, delx)}
              className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500 disabled:opacity-50"
            >
              Sample Δx
            </button>
          </div>
        </div>
        <label className="flex items-center justify-between gap-2">
          Point separation
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={2}
              max={200}
              value={pointSeparation}
              disabled={busy}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) {
                  onPointSeparationChange(Math.min(200, Math.max(2, n)))
                }
              }}
              className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
            />
            {formatSeparation(pointSeparation)}
          </span>
        </label>
        <label className="flex items-center justify-between gap-2">
          Min segment length
          <input
            type="number"
            min={0}
            max={500}
            value={minSegmentLength}
            disabled={busy}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) {
                onMinSegmentLengthChange(Math.min(500, Math.max(0, n)))
              }
            }}
            className="w-16 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fillCorners}
            disabled={busy}
            onChange={(e) => onFillCornersChange(e.target.checked)}
          />
          Fill corners (turns ≥ 30°)
        </label>
        <label className="mt-2 flex items-center gap-1 text-[11px] text-slate-300">
          Max point size
          <input
            type="number"
            min={3}
            max={256}
            value={maxPointSize}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onMaxPointSizeChange(Math.min(256, Math.max(3, Math.round(n))))
            }}
            className="w-14 rounded border border-slate-600 bg-slate-900 px-1 py-0.5"
          />
          px
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onCanvasModeChange(canvasMode === 'point-match' ? 'select' : 'point-match')
            }
            className={modeButtonClass(canvasMode === 'point-match')}
          >
            Point match
          </button>
          <button
            type="button"
            disabled={busy || acceptedCount === 0}
            onClick={onApplyAccepted}
            className="rounded bg-emerald-700 px-2 py-1 text-[11px] hover:bg-emerald-600 disabled:opacity-50"
          >
            Apply accepted ({acceptedCount})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClearCandidates}
            className="rounded bg-slate-600 px-2 py-1 text-[11px] hover:bg-slate-500"
          >
            New sample
          </button>
        </div>
        <button
          type="button"
          disabled={busy || disabled}
          title={
            disabled
              ? 'Select a curve first'
              : 'Click a stroke on the plot to drop evenly spaced points'
          }
          onClick={onEnterSegmentFill}
          className={`rounded px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
            active ? 'bg-sky-600 hover:bg-sky-500' : 'bg-slate-600 hover:bg-slate-500'
          }`}
        >
          Segment fill
        </button>
      </div>
    </section>
  )
}
