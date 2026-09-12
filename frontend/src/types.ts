export type Scale = 'linear' | 'log' | 'date'
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
export type CoordsType = 'cartesian' | 'polar' | 'map' | 'bar'
export type ThetaUnits = 'degrees' | 'radians' | 'gradians' | 'turns'
export type TransformModel = 'auto' | 'orthogonal' | 'affine' | 'projective'
export type CanvasMode =
  | 'select'
  | 'place'
  | 'axis'
  | 'pick-color'
  | 'segment-fill'
  | 'point-match'
  | 'mask-box'
  | 'mask-pen'
  | 'mask-erase'
export type ConnectAs = 'line' | 'scatter'

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
  id?: string
  name?: string
  x: CalibrationAxis
  y: CalibrationAxis
  source: 'manual'
  coords_type?: CoordsType
  model?: TransformModel
  axis_points?: AxisPoint[]
  theta_units?: ThetaUnits
  origin_radius?: number
  scale_bar?: ScaleBar | null
  bar_horizontal?: boolean
}

export interface Point {
  id: string
  pixel: [number, number]
  origin: Origin
  label?: string | null
}

export interface RegionBox {
  x: number
  y: number
  w: number
  h: number
}

export interface RegionMask {
  boxes?: RegionBox[]
  strokes?: [number, number][][]
  erase_strokes?: [number, number][][]
  stroke_width?: number
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
  connect_as?: ConnectAs
  region?: RegionMask | null
  calibration_id?: string | null
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

export interface SegmentPublic {
  index: number
  length: number
  points: [number, number][]
}

export interface MatchCandidate {
  pixel: [number, number]
  score: number
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
  point_separation?: number
  min_segment_length?: number
  fill_corners?: boolean
  max_point_size?: number
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

export interface FigureMeta {
  title: string
  xlabel: string
  ylabel: string
}

export interface Session {
  id: string
  image_meta: ImageMeta
  image_source?: ImageSource | null
  calibration: Calibration | null
  calibrations?: Calibration[]
  manual_calibration?: boolean
  curves: Curve[]
  workspace?: WorkspaceState | null
  history: unknown[]
  image_url: string
  figure: FigureMeta
}

export interface ApiErrorBody {
  error: { code: string; message: string; hint: string }
}
