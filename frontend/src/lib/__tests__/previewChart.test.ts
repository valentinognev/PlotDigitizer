import { describe, expect, it } from 'vitest'
import {
  axisTrackForCurve,
  buildPreviewConfig,
  connectAsToPlotlyMode,
  previewEmptyReason,
  previewSkin,
} from '../previewChart'
import type { Calibration, Curve } from '../../types'

describe('connectAsToPlotlyMode', () => {
  it('uses markers only for scatter and lines+markers for line/default', () => {
    expect(connectAsToPlotlyMode('scatter')).toBe('markers')
    expect(connectAsToPlotlyMode('line')).toBe('lines+markers')
    expect(connectAsToPlotlyMode(undefined)).toBe('lines+markers')
  })
})

function cartesianCal(): Calibration {
  return {
    x: {
      scale: 'linear',
      ref_points: [
        { pixel: [0, 0], value: 0 },
        { pixel: [100, 0], value: 10 },
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

function polarCal(over: Partial<Calibration> = {}): Calibration {
  return {
    ...cartesianCal(),
    coords_type: 'polar',
    theta_units: 'degrees',
    origin_radius: 0,
    axis_points: [
      { id: 'a', pixel: [100, 100], x_value: 0, y_value: 0 },
      { id: 'b', pixel: [180, 100], x_value: 0, y_value: 10 },
      { id: 'c', pixel: [100, 20], x_value: 90, y_value: 10 },
    ],
    ...over,
  }
}

const curve: Curve = {
  id: 'c1',
  label: 'A',
  color: '#f00',
  style: 'unknown',
  visible: true,
  points: [{ id: 'p1', pixel: [180, 100], origin: 'user' }],
}

type PreviewLayout = {
  xaxis?: { type?: string; title?: unknown }
  yaxis?: { type?: string; title?: unknown }
  polar?: { radialaxis?: { type?: string; range?: Array<number | null> } }
}

describe('buildPreviewConfig', () => {
  it('uses cartesian scatter traces by default', () => {
    const cfg = buildPreviewConfig([curve], cartesianCal(), 200)
    const layout = cfg.layout as PreviewLayout
    expect(cfg.traces[0].type).toBe('scatter')
    expect(cfg.traces[0].mode).toBe('lines+markers')
    expect(layout.xaxis?.type).toBe('linear')
  })

  it('uses Plotly date x-axis and ISO timestamps for date scale', () => {
    const cal: Calibration = {
      ...cartesianCal(),
      x: {
        scale: 'date',
        ref_points: [
          { pixel: [0, 0], value: 18262 },
          { pixel: [100, 0], value: 18290 },
        ],
      },
    }
    const cfg = buildPreviewConfig(
      [{ ...curve, points: [{ id: 'p1', pixel: [50, 50], origin: 'user' }] }],
      cal,
      200,
    )
    const layout = cfg.layout as PreviewLayout
    expect(layout.xaxis?.type).toBe('date')
    expect(cfg.traces[0].x).toEqual([new Date(18276 * 86400e3).toISOString()])
  })

  it('uses scatterpolar for polar sessions and respects origin_radius and log radius', () => {
    const cfg = buildPreviewConfig(
      [{ ...curve, connect_as: 'scatter' }],
      polarCal({
        origin_radius: 2,
        y: { ...polarCal().y, scale: 'log' },
        // Phase 1: log-polar axis points must all have R>0 (origin R=0 is invalid)
        axis_points: [
          { id: 'a', pixel: [100, 100], x_value: 0, y_value: 2 },
          { id: 'b', pixel: [180, 100], x_value: 0, y_value: 10 },
          { id: 'c', pixel: [100, 20], x_value: 90, y_value: 10 },
        ],
      }),
      200,
    )
    const layout = cfg.layout as PreviewLayout
    expect(cfg.traces[0].type).toBe('scatterpolar')
    expect(cfg.traces[0].mode).toBe('markers')
    expect(layout.polar?.radialaxis?.type).toBe('log')
    expect(layout.polar?.radialaxis?.range?.[0]).toBe(2)
  })

  it('uses Plotly bar traces with label or point index on x and value on y', () => {
    const cal: Calibration = {
      source: 'manual',
      coords_type: 'bar',
      bar_horizontal: false,
      x: { scale: 'linear', ref_points: [] },
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [50, 100], value: 0 },
          { pixel: [50, 0], value: 10 },
        ],
      },
    }
    const cfg = buildPreviewConfig(
      [
        {
          ...curve,
          points: [
            { id: 'p1', pixel: [50, 50], origin: 'user', label: 'Bar 1' },
            { id: 'p2', pixel: [50, 20], origin: 'user' },
          ],
        },
      ],
      cal,
      200,
    )
    expect(cfg.traces[0].type).toBe('bar')
    expect(cfg.traces[0].x).toEqual(['Bar 1', 1])
    const ys = cfg.traces[0].y as number[]
    expect(ys[0]).toBeCloseTo(5, 12)
    expect(ys[1]).toBeCloseTo(8, 12)
  })

  it('labels map axes with scale-bar units', () => {
    const cal: Calibration = {
      ...cartesianCal(),
      coords_type: 'map',
      scale_bar: {
        pixel_a: [0, 100],
        pixel_b: [100, 100],
        length: 50,
        units: 'km',
      },
    }
    const cfg = buildPreviewConfig([curve], cal, 200)
    const layout = cfg.layout as PreviewLayout
    expect(cfg.traces[0].type).toBe('scatter')
    expect(String(layout.xaxis?.title)).toContain('km')
    expect(String(layout.yaxis?.title)).toContain('km')
  })

  it('applies figure title and axis label overrides for cartesian', () => {
    const cfg = buildPreviewConfig([curve], cartesianCal(), 200, {
      title: 'Fig',
      xlabel: 'Time',
      ylabel: 'V',
    })
    const layout = cfg.layout as PreviewLayout & {
      title?: { text?: string; automargin?: boolean }
    }
    expect(layout.title?.text).toBe('Fig')
    expect(layout.title?.automargin).toBe(true)
    expect(layout.xaxis?.title).toBe('Time')
    expect(layout.yaxis?.title).toBe('V')
  })

  it('keeps default axis titles and no layout title when figure is empty/omitted', () => {
    const cfg = buildPreviewConfig([curve], cartesianCal(), 200)
    const layout = cfg.layout as PreviewLayout & { title?: unknown }
    expect(layout.xaxis?.title).toBe('X')
    expect(layout.yaxis?.title).toBe('Y')
    expect(layout.title).toBeUndefined()

    const cfgWithEmptyFigure = buildPreviewConfig([curve], cartesianCal(), 200, {
      title: '',
      xlabel: '  ',
      ylabel: '',
    })
    const layout2 = cfgWithEmptyFigure.layout as PreviewLayout & { title?: unknown }
    expect(layout2.xaxis?.title).toBe('X')
    expect(layout2.yaxis?.title).toBe('Y')
    expect(layout2.title).toBeUndefined()
  })

  it('maps figure labels to polar radial/angular axis titles', () => {
    const cfg = buildPreviewConfig(
      [{ ...curve, connect_as: 'scatter' }],
      polarCal(),
      200,
      { title: '', xlabel: 'theta', ylabel: 'radius' },
    )
    const layout = cfg.layout as PreviewLayout & {
      polar?: { radialaxis?: { title?: unknown }; angularaxis?: { title?: unknown } }
    }
    expect(layout.polar?.radialaxis?.title).toBe('radius')
    expect(layout.polar?.angularaxis?.title).toBe('theta')
  })

  it('overrides default map axis label style with a custom xlabel', () => {
    const cal: Calibration = {
      ...cartesianCal(),
      coords_type: 'map',
      scale_bar: {
        pixel_a: [0, 100],
        pixel_b: [100, 100],
        length: 50,
        units: 'km',
      },
    }
    const cfg = buildPreviewConfig([curve], cal, 200, { title: '', xlabel: 'Distance', ylabel: '' })
    const layout = cfg.layout as PreviewLayout
    expect(layout.xaxis?.title).toBe('Distance')
    expect(String(layout.yaxis?.title)).toContain('km')
  })

  it('maps each curve through its own cartesian cal and overlays y2 for the second', () => {
    const left: Calibration = {
      ...cartesianCal(),
      id: 'cal-left',
      name: 'Left',
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [0, 100], value: 0 },
          { pixel: [0, 0], value: 10 },
        ],
      },
    }
    const right: Calibration = {
      ...cartesianCal(),
      id: 'cal-right',
      name: 'Right',
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [0, 100], value: 0 },
          { pixel: [0, 0], value: 100 },
        ],
      },
    }
    const leftCurve: Curve = {
      ...curve,
      calibration_id: 'cal-left',
      points: [{ id: 'p1', pixel: [0, 0], origin: 'user' }],
    }
    const rightCurve: Curve = {
      ...curve,
      id: 'c2',
      label: 'B',
      color: '#0f0',
      calibration_id: 'cal-right',
      points: [{ id: 'p2', pixel: [0, 0], origin: 'user' }],
    }
    const cfg = buildPreviewConfig(
      [leftCurve, rightCurve],
      { calibration: left, calibrations: [left, right] },
      200,
    )
    expect(cfg.traces).toHaveLength(2)
    expect(cfg.traces[0].yaxis).toBeUndefined()
    expect(cfg.traces[1].yaxis).toBe('y2')
    expect((cfg.traces[0].y as number[])[0]).toBeCloseTo(10, 12)
    expect((cfg.traces[1].y as number[])[0]).toBeCloseTo(100, 12)
    const layout = cfg.layout as PreviewLayout & {
      yaxis2?: { overlaying?: string; side?: string }
    }
    expect(layout.yaxis2?.overlaying).toBe('y')
    expect(layout.yaxis2?.side).toBe('right')
  })

  it('lays out y/y2 from first cartesian vs y2 holder even when the active cal is the second', () => {
    const left: Calibration = {
      ...cartesianCal(),
      id: 'cal-left',
      name: 'Left',
      x: {
        scale: 'linear',
        ref_points: [
          { pixel: [0, 0], value: 0 },
          { pixel: [100, 0], value: 10 },
        ],
      },
      y: {
        scale: 'linear',
        ref_points: [
          { pixel: [0, 100], value: 0 },
          { pixel: [0, 0], value: 10 },
        ],
      },
    }
    const right: Calibration = {
      ...cartesianCal(),
      id: 'cal-right',
      name: 'Right',
      x: {
        scale: 'log',
        ref_points: [
          { pixel: [0, 0], value: 1 },
          { pixel: [100, 0], value: 100 },
        ],
      },
      y: {
        scale: 'log',
        ref_points: [
          { pixel: [0, 100], value: 1 },
          { pixel: [0, 0], value: 100 },
        ],
      },
    }
    const leftCurve: Curve = {
      ...curve,
      calibration_id: 'cal-left',
      points: [{ id: 'p1', pixel: [50, 50], origin: 'user' }],
    }
    const rightCurve: Curve = {
      ...curve,
      id: 'c2',
      label: 'B',
      color: '#0f0',
      calibration_id: 'cal-right',
      points: [{ id: 'p2', pixel: [50, 50], origin: 'user' }],
    }
    const cfg = buildPreviewConfig(
      [leftCurve, rightCurve],
      { calibration: right, calibrations: [left, right] },
      200,
    )
    const layout = cfg.layout as PreviewLayout & {
      yaxis2?: { type?: string; overlaying?: string }
    }
    expect(cfg.traces[0].yaxis).toBeUndefined()
    expect(cfg.traces[1].yaxis).toBe('y2')
    expect(layout.xaxis?.type).toBe('linear')
    expect(layout.yaxis?.type).toBe('linear')
    expect(layout.yaxis2?.type).toBe('log')
    expect(layout.yaxis2?.overlaying).toBe('y')
  })

  it('uses night plot chrome by default and day colors when theme is day', () => {
    const night = buildPreviewConfig([curve], cartesianCal(), 200)
    expect(night.layout.paper_bgcolor).toBe('#0f172a')
    expect(night.layout.plot_bgcolor).toBe('#1e293b')
    expect((night.layout.font as { color: string }).color).toBe('#e2e8f0')
    expect((night.layout.xaxis as { gridcolor: string }).gridcolor).toBe('#334155')

    const day = buildPreviewConfig([curve], cartesianCal(), 200, undefined, 'day')
    expect(day.layout.paper_bgcolor).toBe('#f8fafc')
    expect(day.layout.plot_bgcolor).toBe('#ffffff')
    expect((day.layout.font as { color: string }).color).toBe('#0f172a')
    expect((day.layout.xaxis as { gridcolor: string }).gridcolor).toBe('#cbd5e1')
    expect(previewSkin('night').paper_bgcolor).toBe('#0f172a')
    expect(previewSkin('day').paper_bgcolor).toBe('#f8fafc')
  })
})

describe('previewEmptyReason', () => {
  it('explains log(0) instead of a generic missing-calibration message', () => {
    const cal: Calibration = {
      ...cartesianCal(),
      x: { ...cartesianCal().x, scale: 'log' },
      y: { ...cartesianCal().y, scale: 'log' },
    }
    const reason = previewEmptyReason(cal, true)
    expect(reason).toMatch(/Log scale cannot use Xmin = 0 and Ymin = 0/)
    expect(reason).toMatch(/greater than 0/)
    expect(reason).not.toMatch(/Set calibration to preview/i)
    expect(reason).not.toMatch(/reference values/i)
  })

  it('is null when log bounds are positive', () => {
    const cal: Calibration = {
      ...cartesianCal(),
      x: {
        scale: 'log',
        ref_points: [
          { pixel: [0, 0], value: 1 },
          { pixel: [100, 0], value: 10 },
        ],
      },
      y: {
        scale: 'log',
        ref_points: [
          { pixel: [0, 100], value: 1 },
          { pixel: [0, 0], value: 10 },
        ],
      },
    }
    expect(previewEmptyReason(cal, true)).toBeNull()
  })
})

describe('axisTrackForCurve', () => {
  const left: Calibration = { ...cartesianCal(), id: 'cal-left', name: 'Left' }
  const right: Calibration = { ...cartesianCal(), id: 'cal-right', name: 'Right' }
  const extra: Calibration = { ...cartesianCal(), id: 'cal-extra', name: 'Extra' }
  const polar: Calibration = { ...polarCal(), id: 'cal-polar', name: 'Polar' }

  function bound(id: string | null): Curve {
    return { ...curve, calibration_id: id }
  }

  it('assigns y to the first cartesian calibration', () => {
    expect(axisTrackForCurve(bound('cal-left'), [left, right])).toBe('y')
  })

  it('assigns y2 to the second distinct cartesian calibration', () => {
    expect(axisTrackForCurve(bound('cal-right'), [left, right])).toBe('y2')
  })

  it('still plots a third cartesian calibration on y2 (first vs rest)', () => {
    expect(axisTrackForCurve(bound('cal-extra'), [left, right, extra])).toBe('y2')
  })

  it('assigns y when the curve has no calibration_id (falls back to first)', () => {
    expect(axisTrackForCurve(bound(null), [left, right])).toBe('y')
  })

  it('uses the same fallback as mapping when the curve has no calibration_id', () => {
    expect(axisTrackForCurve(bound(null), [left, right], right)).toBe('y2')
    expect(axisTrackForCurve(bound(null), [left, right], left)).toBe('y')
  })

  it('ignores a leading polar calibration when choosing the first cartesian track', () => {
    expect(axisTrackForCurve(bound('cal-left'), [polar, left, right])).toBe('y')
    expect(axisTrackForCurve(bound('cal-right'), [polar, left, right])).toBe('y2')
  })
})
