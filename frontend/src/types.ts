export type Scale = 'linear' | 'log'
export type Origin = 'ai' | 'user'
export type CurveStyle = 'solid' | 'dashed' | 'dotted' | 'unknown'

export interface RefPoint {
  pixel: [number, number]
  value: number
}

export interface CalibrationAxis {
  scale: Scale
  ref_points: RefPoint[]
}

export interface Calibration {
  x: CalibrationAxis
  y: CalibrationAxis
  source: 'manual'
}

export interface Point {
  id: string
  pixel: [number, number]
  origin: Origin
}

export interface Curve {
  id: string
  label: string
  color: string
  trace_color?: string | null
  style: CurveStyle
  visible: boolean
  target_point_count?: number
  points: Point[]
}

export interface ImageMeta {
  width: number
  height: number
  scale_factor: number
  revision?: number
}

export interface ImageSource {
  filename?: string | null
  path?: string | null
}

export interface WorkspaceState {
  active_curve_id?: string | null
  resample_count?: number
}

export interface Session {
  id: string
  image_meta: ImageMeta
  image_source?: ImageSource | null
  calibration: Calibration | null
  manual_calibration?: boolean
  curves: Curve[]
  workspace?: WorkspaceState | null
  history: unknown[]
  image_url: string
}

export interface ApiErrorBody {
  error: { code: string; message: string; hint: string }
}
