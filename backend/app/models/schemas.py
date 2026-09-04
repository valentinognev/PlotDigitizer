from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


Scale = Literal["linear", "log"]
Origin = Literal["ai", "user"]
CurveStyle = Literal["solid", "dashed", "dotted", "unknown"]
CalibrationSource = Literal["manual"]
FilterMode = Literal["intensity", "foreground", "hue", "saturation", "value"]
ConnectAs = Literal["line", "scatter"]


class ColorFilter(BaseModel):
    mode: FilterMode = "intensity"
    low: float = Field(default=0.0, ge=0.0, le=1.0)
    high: float = Field(default=0.4, ge=0.0, le=1.0)
    sample_color: str | None = None
    remove_grid: bool = False


class GridGeometrySettings(BaseModel):
    start_x: float = 0.0
    step_x: float = 0.0
    count_x: int = 0
    start_y: float = 0.0
    step_y: float = 0.0
    count_y: int = 0
    close_distance: int = 10


CoordsType = Literal["cartesian", "polar", "map"]
ThetaUnits = Literal["degrees", "radians", "gradians", "turns"]
TransformModel = Literal["auto", "orthogonal", "affine", "projective"]

DEFAULT_POINT_COUNT = 9
DEFAULT_MESH_SECTIONS = 3
MIN_MESH_SECTIONS = 2
MAX_MESH_SECTIONS = 8


class RefPoint(BaseModel):
    pixel: tuple[float, float]
    value: float


class CalibrationAxis(BaseModel):
    scale: Scale = "linear"
    ref_points: list[RefPoint] = Field(default_factory=list)


class AxisPoint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    pixel: tuple[float, float]
    x_value: float | None = None  # cartesian X, or polar θ
    y_value: float | None = None  # cartesian Y, or polar R


class ScaleBar(BaseModel):
    pixel_a: tuple[float, float]
    pixel_b: tuple[float, float]
    length: float
    units: str = ""


class Calibration(BaseModel):
    x: CalibrationAxis
    y: CalibrationAxis
    source: CalibrationSource = "manual"
    coords_type: CoordsType = "cartesian"
    model: TransformModel = "auto"
    axis_points: list[AxisPoint] = Field(default_factory=list)
    theta_units: ThetaUnits = "degrees"
    origin_radius: float = 0.0
    scale_bar: ScaleBar | None = None


class Point(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    pixel: tuple[float, float]
    origin: Origin = "user"


class Curve(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    label: str
    color: str = "#3b82f6"
    trace_color: str | None = None
    style: CurveStyle = "unknown"
    visible: bool = True
    target_point_count: int = Field(default=DEFAULT_POINT_COUNT, ge=2, le=200)
    points: list[Point] = Field(default_factory=list)
    filter: ColorFilter | None = None
    connect_as: ConnectAs = "line"

    @property
    def cv_color(self) -> str:
        return self.trace_color or self.color


class ImageMeta(BaseModel):
    width: int
    height: int
    scale_factor: float = 1.0
    revision: int = 0


class ImageSource(BaseModel):
    filename: str | None = None
    path: str | None = None


class MeshVertexPayload(BaseModel):
    row: int = Field(ge=0, le=MAX_MESH_SECTIONS)
    col: int = Field(ge=0, le=MAX_MESH_SECTIONS)
    position: tuple[float, float]
    tangent_h: tuple[float, float] | None = None
    tangent_v: tuple[float, float] | None = None


class MeshGridPayload(BaseModel):
    sections: int = Field(default=DEFAULT_MESH_SECTIONS, ge=MIN_MESH_SECTIONS, le=MAX_MESH_SECTIONS)
    vertices: list[MeshVertexPayload]


class WorkspaceState(BaseModel):
    active_curve_id: str | None = None
    resample_count: int = Field(default=DEFAULT_POINT_COUNT, ge=2, le=200)
    unskew_mode: Literal["perspective", "mesh"] | None = None
    mesh: MeshGridPayload | None = None
    canvas_mode: Literal[
        "select", "place", "axis", "pick-color", "segment-fill", "point-match"
    ] = "select"
    show_axes_checker: bool = True
    show_mask: bool = False
    grid: GridGeometrySettings | None = None
    point_separation: float = 25.0
    min_segment_length: float = 2.0
    fill_corners: bool = False
    max_point_size: int = Field(default=48, ge=3, le=256)


class HistoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    action: str
    snapshot: dict[str, Any]


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    image_meta: ImageMeta
    image_source: ImageSource | None = None
    calibration: Calibration | None = None
    manual_calibration: bool = True
    curves: list[Curve] = Field(default_factory=list)
    workspace: WorkspaceState | None = None
    history: list[HistoryEntry] = Field(default_factory=list)


class SessionPublic(BaseModel):
    id: str
    image_meta: ImageMeta
    image_source: ImageSource | None = None
    calibration: Calibration | None
    manual_calibration: bool = True
    curves: list[Curve]
    workspace: WorkspaceState | None = None
    history: list[HistoryEntry]
    image_url: str


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    hint: str = ""


class ApiError(BaseModel):
    error: ApiErrorDetail


class CalibrationUpdate(BaseModel):
    calibration: Calibration
    manual_calibration: bool | None = None


class SessionPreferencesPatch(BaseModel):
    calibration: Calibration | None = None
    manual_calibration: bool | None = None
    workspace: WorkspaceState | None = None


class ResampleRequest(BaseModel):
    curve_id: str
    target_count: int = DEFAULT_POINT_COUNT


class CurvesPatch(BaseModel):
    curves: list[Curve] | None = None
    active_curve_id: str | None = None


class PointPatch(BaseModel):
    point_id: str
    pixel: tuple[float, float] | None = None
    curve_id: str | None = None
    delete: bool = False
    origin: Origin = "user"


class CurvesEditRequest(BaseModel):
    curves: list[Curve] | None = None
    add_point: tuple[float, float] | None = None
    add_to_curve_id: str | None = None
    point_patches: list[PointPatch] | None = None


class ExportFormat(BaseModel):
    format: Literal["csv", "json"] = "json"


class UnskewApplyRequest(BaseModel):
    mode: Literal["perspective", "mesh"] = "perspective"
    mesh: MeshGridPayload | None = None
    # When set, warp uses these bounds (must match the client preview). Session calibration
    # is updated to this value on apply so marks stay aligned with the committed image.
    calibration: Calibration | None = None


class FilterSuggestRequest(BaseModel):
    pixel: tuple[float, float]
    curve_id: str | None = None


class GridDetectRequest(BaseModel):
    curve_id: str | None = None


class SnapRequest(BaseModel):
    curve_id: str
    pixels: list[tuple[float, float]]
    window: int = 7
    direction: tuple[float, float] | None = None


class SnapResponse(BaseModel):
    pixels: list[tuple[float, float]]


class SegmentPublic(BaseModel):
    index: int
    length: float
    points: list[tuple[float, float]]


class SegmentsResponse(BaseModel):
    segments: list[SegmentPublic]


class SegmentFillRequest(BaseModel):
    pixel: tuple[float, float]
    separation: float | None = Field(default=None, gt=0)
    fill_corners: bool | None = None


class MatchCandidateOut(BaseModel):
    pixel: tuple[float, float]
    score: float


class PointMatchRequest(BaseModel):
    pixel: tuple[float, float]
    sample_radius: int | None = None
    max_point_size: int | None = None


class PointMatchResponse(BaseModel):
    candidates: list[MatchCandidateOut]


class PointMatchAcceptRequest(BaseModel):
    pixels: list[tuple[float, float]]
