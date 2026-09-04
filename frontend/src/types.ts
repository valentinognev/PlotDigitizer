export type Scale = 'linear' | 'log'
export type Origin = 'ai' | 'user'
export type CurveStyle = 'solid' | 'dashed' | 'dotted' | 'unknown'
export type FilterMode = 'intensity' | 'foreground' | 'hue' | 'saturation' | 'value'

export interface ColorFilter {
  mode: FilterMode
  low: number
  high: number
  sample_color?: string | null
  remove_grid?: boolean
}

export interface GridGeometrySettings {
  start_x: number
  step_x: number
  count_x: number
  start_y: number
  step_y: number
  count_y: number
  close_distance?: number
}
export type CoordsType = 'cartesian' | 'polar' | 'map'
export type ThetaUnits = 'degrees' | 'radians' | 'gradians' | 'turns'
export type TransformModel = 'auto' | 'orthogonal' | 'affine' | 'projective'
export type CanvasMode = 'select' | 'place' | 'axis' | 'pick-color' | 'segment-fill' | 'point-match'

export interface RefPoint {
  pixel: [number, number]
  value: number
}

export interface CalibrationAxis {
  scale: Scale
  ref_points: RefPoint[]
}

export interface AxisPoint {
  id: string
  pixel: [number, number]
  x_value?: number | null
  y_value?: number | null
}

export interface ScaleBar {
  pixel_a: [number, number]
  pixel_b: [number, number]
  length: number
  units?: string
}

export interface Calibration {
  x: CalibrationAxis
  y: CalibrationAxis
  source: 'manual'
  coords_type?: CoordsType
  model?: TransformModel
  axis_points?: AxisPoint[]
  theta_units?: ThetaUnits
  origin_radius?: number
  scale_bar?: ScaleBar | null
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
  filter?: ColorFilter | null
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
  unskew_mode?: 'perspective' | 'mesh'
  mesh?: MeshGridPayload | null
  canvas_mode?: CanvasMode
  show_axes_checker?: boolean
  show_mask?: boolean
  grid?: GridGeometrySettings | null
}

export interface MeshVertexPayload {
  row: number
  col: number
  position: [number, number]
  tangent_h?: [number, number]
  tangent_v?: [number, number]
}

export interface MeshGridPayload {
  sections?: number
  vertices: MeshVertexPayload[]
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
