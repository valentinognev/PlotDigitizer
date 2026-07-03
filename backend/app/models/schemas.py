from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


Scale = Literal["linear", "log"]
Origin = Literal["ai", "user"]
CurveStyle = Literal["solid", "dashed", "dotted", "unknown"]
CalibrationSource = Literal["manual"]

DEFAULT_POINT_COUNT = 9


class RefPoint(BaseModel):
    pixel: tuple[float, float]
    value: float


class CalibrationAxis(BaseModel):
    scale: Scale = "linear"
    ref_points: list[RefPoint] = Field(default_factory=list)


class Calibration(BaseModel):
    x: CalibrationAxis
    y: CalibrationAxis
    source: CalibrationSource = "manual"


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


class WorkspaceState(BaseModel):
    active_curve_id: str | None = None
    resample_count: int = Field(default=DEFAULT_POINT_COUNT, ge=2, le=200)


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
