import { describe, expect, it } from 'vitest'
import { buildPreviewConfig, connectAsToPlotlyMode } from '../previewChart'
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
})
