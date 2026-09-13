import type { Calibration, CanvasMode } from '../types'
import { getAxisBounds, isCalibrationValid } from './transform'

export type WorkflowStage = 'image' | 'axes' | 'digitize'

export const WORKFLOW_STAGE_TABS: { id: WorkflowStage; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'axes', label: 'Axes' },
  { id: 'digitize', label: 'Digitize' },
]

export const UNSKEW_PLACE_AXES_HINT = 'Place axis bounds in Calibration first'

export type StageChrome = {
  showUnskew: boolean
  showFilter: boolean
  showCurvePicker: boolean
  showCalibration: boolean
  showFigureFields: boolean
  showAutoDigitize: boolean
  showCurveList: boolean
  showPreview: boolean
  showDataTable: boolean
}

const IMAGE_CHROME: StageChrome = {
  showUnskew: true,
  showFilter: true,
  showCurvePicker: true,
  showCalibration: false,
  showFigureFields: false,
  showAutoDigitize: false,
  showCurveList: false,
  showPreview: false,
  showDataTable: false,
}

const AXES_CHROME: StageChrome = {
  showUnskew: false,
  showFilter: false,
  showCurvePicker: false,
  showCalibration: true,
  showFigureFields: true,
  showAutoDigitize: false,
  showCurveList: false,
  showPreview: true,
  showDataTable: true,
}

const DIGITIZE_CHROME: StageChrome = {
  showUnskew: false,
  showFilter: false,
  showCurvePicker: false,
  showCalibration: false,
  showFigureFields: false,
  showAutoDigitize: true,
  showCurveList: true,
  showPreview: true,
  showDataTable: true,
}

export function stageChrome(stage: WorkflowStage): StageChrome {
  if (stage === 'image') return IMAGE_CHROME
  if (stage === 'axes') return AXES_CHROME
  return DIGITIZE_CHROME
}

export type SessionStageInput = {
  id: string
  calibration: Calibration | null
  curves: Array<{ points: unknown[] }>
}

export function defaultWorkflowStage(
  session: SessionStageInput | null,
  reason: 'upload' | 'restore',
): WorkflowStage {
  if (session === null || reason === 'upload') return 'image'
  if (session.curves.some((curve) => curve.points.length > 0)) return 'digitize'
  if (isCalibrationValid(session.calibration)) return 'axes'
  return 'image'
}

/** `null` means keep the current tab (same session id). */
export function nextStageOnSessionIdentityChange(
  previousSessionId: string | null,
  session: SessionStageInput | null,
  reason: 'upload' | 'restore',
): WorkflowStage | null {
  if (session === null) return 'image'
  if (session.id === previousSessionId) return null
  return defaultWorkflowStage(session, reason)
}

export const IMAGE_EXCLUSIVE_MODES: readonly CanvasMode[] = ['pick-color']
export const AXIS_EXCLUSIVE_MODES: readonly CanvasMode[] = ['axis']
export const DIGITIZE_EXCLUSIVE_MODES: readonly CanvasMode[] = [
  'place',
  'segment-fill',
  'point-match',
  'mask-box',
  'mask-pen',
  'mask-erase',
]

const EXCLUSIVE_BY_STAGE: Record<WorkflowStage, readonly CanvasMode[]> = {
  image: IMAGE_EXCLUSIVE_MODES,
  axes: AXIS_EXCLUSIVE_MODES,
  digitize: DIGITIZE_EXCLUSIVE_MODES,
}

export function canvasModeAfterLeavingStage(
  leaving: WorkflowStage,
  mode: CanvasMode,
): CanvasMode {
  return EXCLUSIVE_BY_STAGE[leaving].includes(mode) ? 'select' : mode
}

/** Keep `mode` if this stage allows it; otherwise `select`. Exclusive to another stage → select. */
export function canvasModeAllowedOnStage(stage: WorkflowStage, mode: CanvasMode): CanvasMode {
  if (EXCLUSIVE_BY_STAGE[stage].includes(mode)) return mode
  for (const [other, modes] of Object.entries(EXCLUSIVE_BY_STAGE) as [
    WorkflowStage,
    readonly CanvasMode[],
  ][]) {
    if (other !== stage && modes.includes(mode)) return 'select'
  }
  return mode
}

export function shouldResetAxisPlacement(leaving: WorkflowStage): boolean {
  return leaving === 'axes'
}

export function shouldResetAxisPlacementOnStage(stage: WorkflowStage): boolean {
  return stage !== 'axes'
}

export function hasPlacedAxisBounds(calibration: Calibration | null): boolean {
  return calibration !== null && getAxisBounds(calibration) !== null
}

export function previewGridClassName(showPreview: boolean): string {
  return showPreview
    ? 'grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-2 gap-2 p-2 lg:grid-cols-2 lg:grid-rows-1'
    : 'grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 gap-2 p-2'
}

export function shouldRenderTopStrip(chrome: StageChrome): boolean {
  return chrome.showUnskew || chrome.showFilter || chrome.showCalibration
}
