import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types'
import {
  AXIS_EXCLUSIVE_MODES,
  DIGITIZE_EXCLUSIVE_MODES,
  IMAGE_EXCLUSIVE_MODES,
  UNSKEW_PLACE_AXES_HINT,
  WORKFLOW_STAGE_TABS,
  canvasModeAfterLeavingStage,
  canvasModeAllowedOnStage,
  defaultWorkflowStage,
  hasPlacedAxisBounds,
  nextStageOnSessionIdentityChange,
  previewGridClassName,
  shouldRenderTopStrip,
  shouldResetAxisPlacement,
  shouldResetAxisPlacementOnStage,
  stageChrome,
} from '../workflowStage'

function validCartesian(): Calibration {
  return {
    x: {
      scale: 'linear',
      ref_points: [
        { pixel: [0, 100], value: 0 },
        { pixel: [100, 100], value: 10 },
      ],
    },
    y: {
      scale: 'linear',
      ref_points: [
        { pixel: [0, 100], value: 0 },
        { pixel: [0, 0], value: 10 },
      ],
    },
    source: 'manual',
    coords_type: 'cartesian',
  }
}

describe('WORKFLOW_STAGE_TABS', () => {
  it('is Image, Axes, Digitize in that order', () => {
    expect(WORKFLOW_STAGE_TABS.map((t) => t.id)).toEqual(['image', 'axes', 'digitize'])
    expect(WORKFLOW_STAGE_TABS.map((t) => t.label)).toEqual(['Image', 'Axes', 'Digitize'])
  })
})

describe('stageChrome', () => {
  it('shows image-prep tools only on image', () => {
    expect(stageChrome('image')).toEqual({
      showUnskew: true,
      showFilter: true,
      showCurvePicker: true,
      showCalibration: false,
      showFigureFields: false,
      showAutoDigitize: false,
      showCurveList: false,
      showPreview: false,
      showDataTable: false,
    })
  })

  it('shows calibration, figure fields, and preview on axes', () => {
    expect(stageChrome('axes')).toEqual({
      showUnskew: false,
      showFilter: false,
      showCurvePicker: false,
      showCalibration: true,
      showFigureFields: true,
      showAutoDigitize: false,
      showCurveList: false,
      showPreview: true,
      showDataTable: true,
    })
  })

  it('shows digitize tools and preview on digitize', () => {
    expect(stageChrome('digitize')).toEqual({
      showUnskew: false,
      showFilter: false,
      showCurvePicker: false,
      showCalibration: false,
      showFigureFields: false,
      showAutoDigitize: true,
      showCurveList: true,
      showPreview: true,
      showDataTable: true,
    })
  })
})

describe('defaultWorkflowStage', () => {
  const valid = {
    id: 's1',
    calibration: validCartesian(),
    curves: [{ points: [{}, {}] }],
  }

  it('lands on image when there is no session', () => {
    expect(defaultWorkflowStage(null, 'restore')).toBe('image')
  })

  it('always lands on image after upload', () => {
    expect(defaultWorkflowStage(valid, 'upload')).toBe('image')
  })

  it('restores to digitize when any curve has points', () => {
    expect(defaultWorkflowStage(valid, 'restore')).toBe('digitize')
  })

  it('restores to axes when calibration is valid but there are no points', () => {
    expect(
      defaultWorkflowStage(
        { id: 's1', calibration: validCartesian(), curves: [{ points: [] }] },
        'restore',
      ),
    ).toBe('axes')
  })

  it('restores to image when calibration is missing and there are no points', () => {
    expect(
      defaultWorkflowStage({ id: 's1', calibration: null, curves: [] }, 'restore'),
    ).toBe('image')
  })
})

describe('nextStageOnSessionIdentityChange', () => {
  it('returns image when the session is cleared', () => {
    expect(nextStageOnSessionIdentityChange('s1', null, 'restore')).toBe('image')
  })

  it('returns null when the session id is unchanged', () => {
    expect(
      nextStageOnSessionIdentityChange(
        's1',
        { id: 's1', calibration: null, curves: [] },
        'restore',
      ),
    ).toBeNull()
  })

  it('returns the landing stage when the session id changes', () => {
    expect(
      nextStageOnSessionIdentityChange(
        'old',
        { id: 'new', calibration: validCartesian(), curves: [{ points: [{}] }] },
        'restore',
      ),
    ).toBe('digitize')
  })
})

describe('canvasModeAllowedOnStage', () => {
  it('clamps axis to select on digitize', () => {
    expect(canvasModeAllowedOnStage('digitize', 'axis')).toBe('select')
  })

  it('keeps axis on axes', () => {
    expect(canvasModeAllowedOnStage('axes', 'axis')).toBe('axis')
  })

  it('clamps pick-color to select on digitize', () => {
    expect(canvasModeAllowedOnStage('digitize', 'pick-color')).toBe('select')
  })

  it('keeps pick-color on image', () => {
    expect(canvasModeAllowedOnStage('image', 'pick-color')).toBe('pick-color')
  })

  it('clamps place to select on image', () => {
    expect(canvasModeAllowedOnStage('image', 'place')).toBe('select')
  })

  it('keeps place on digitize', () => {
    expect(canvasModeAllowedOnStage('digitize', 'place')).toBe('place')
  })

  it('keeps select on every stage', () => {
    expect(canvasModeAllowedOnStage('image', 'select')).toBe('select')
    expect(canvasModeAllowedOnStage('axes', 'select')).toBe('select')
    expect(canvasModeAllowedOnStage('digitize', 'select')).toBe('select')
  })
})

describe('shouldResetAxisPlacementOnStage', () => {
  it('resets axis placement UI on image and digitize, not on axes', () => {
    expect(shouldResetAxisPlacementOnStage('image')).toBe(true)
    expect(shouldResetAxisPlacementOnStage('digitize')).toBe(true)
    expect(shouldResetAxisPlacementOnStage('axes')).toBe(false)
  })
})

describe('canvasModeAfterLeavingStage', () => {
  it('cancels pick-color when leaving image only', () => {
    expect(IMAGE_EXCLUSIVE_MODES).toEqual(['pick-color'])
    expect(canvasModeAfterLeavingStage('image', 'pick-color')).toBe('select')
    expect(canvasModeAfterLeavingStage('digitize', 'pick-color')).toBe('pick-color')
  })

  it('cancels axis when leaving axes', () => {
    expect(AXIS_EXCLUSIVE_MODES).toEqual(['axis'])
    expect(canvasModeAfterLeavingStage('axes', 'axis')).toBe('select')
    expect(canvasModeAfterLeavingStage('axes', 'place')).toBe('place')
    expect(shouldResetAxisPlacement('axes')).toBe(true)
    expect(shouldResetAxisPlacement('image')).toBe(false)
  })

  it('cancels digitize tools when leaving digitize', () => {
    expect([...DIGITIZE_EXCLUSIVE_MODES]).toEqual([
      'place',
      'segment-fill',
      'point-match',
      'mask-box',
      'mask-pen',
      'mask-erase',
    ])
    expect(canvasModeAfterLeavingStage('digitize', 'place')).toBe('select')
    expect(canvasModeAfterLeavingStage('digitize', 'mask-pen')).toBe('select')
    expect(canvasModeAfterLeavingStage('image', 'place')).toBe('place')
  })
})

describe('hasPlacedAxisBounds', () => {
  it('is false without two refs per axis', () => {
    expect(hasPlacedAxisBounds(null)).toBe(false)
    expect(
      hasPlacedAxisBounds({
        x: { scale: 'linear', ref_points: [] },
        y: { scale: 'linear', ref_points: [] },
        source: 'manual',
      }),
    ).toBe(false)
  })

  it('is true for a four-bound cartesian set', () => {
    expect(hasPlacedAxisBounds(validCartesian())).toBe(true)
  })
})

describe('previewGridClassName', () => {
  it('uses two columns when preview is shown and one when hidden', () => {
    expect(previewGridClassName(true)).toBe(
      'grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-2 gap-2 p-2 lg:grid-cols-2 lg:grid-rows-1',
    )
    expect(previewGridClassName(false)).toBe(
      'grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 gap-2 p-2',
    )
  })
})

describe('shouldRenderTopStrip', () => {
  it('omits the top strip on digitize and keeps it on image and axes', () => {
    expect(shouldRenderTopStrip(stageChrome('image'))).toBe(true)
    expect(shouldRenderTopStrip(stageChrome('axes'))).toBe(true)
    expect(shouldRenderTopStrip(stageChrome('digitize'))).toBe(false)
  })
})

describe('UNSKEW_PLACE_AXES_HINT', () => {
  it('tells the user to place axes first', () => {
    expect(UNSKEW_PLACE_AXES_HINT).toBe('Place axis bounds in Calibration first')
  })
})
