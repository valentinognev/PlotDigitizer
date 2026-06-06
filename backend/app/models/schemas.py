from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


Scale = Literal["linear", "log"]
Origin = Literal["ai", "user"]
CurveStyle = Literal["solid", "dashed", "dotted", "unknown"]
CalibrationSource = Literal["ai", "manual"]
ProviderName = Literal["openai", "anthropic", "gemini"]
MergeOp = Literal["detect", "refine", "redetect_curve"]


class RefPoint(BaseModel):
    pixel: tuple[float, float]
    value: float


class CalibrationAxis(BaseModel):
    scale: Scale = "linear"
    ref_points: list[RefPoint] = Field(default_factory=list)


class Calibration(BaseModel):
    x: CalibrationAxis
    y: CalibrationAxis
    source: CalibrationSource = "ai"


class Point(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    pixel: tuple[float, float]
    origin: Origin = "ai"


class Curve(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    label: str
    color: str = "#3b82f6"
    style: CurveStyle = "unknown"
    visible: bool = True
    points: list[Point] = Field(default_factory=list)


class ImageMeta(BaseModel):
    width: int
    height: int
    scale_factor: float = 1.0


class HistoryEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    action: str
    snapshot: dict[str, Any]


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    image_meta: ImageMeta
    calibration: Calibration | None = None
    curves: list[Curve] = Field(default_factory=list)
    history: list[HistoryEntry] = Field(default_factory=list)
  # image bytes stored outside model in SessionStore


class SessionPublic(BaseModel):
    id: str
    image_meta: ImageMeta
    calibration: Calibration | None
    curves: list[Curve]
    history: list[HistoryEntry]
    image_url: str


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class VLMTick(BaseModel):
    pixel: tuple[float, float]
    value: float


class VLMAxis(BaseModel):
    scale: Scale = "linear"
    ticks: list[VLMTick] = Field(default_factory=list)


class VLMCurve(BaseModel):
    label: str
    color_hex: str = "#3b82f6"
    style: CurveStyle = "unknown"
    seed_points: list[tuple[float, float]] = Field(default_factory=list)


class VLMAxes(BaseModel):
    x: VLMAxis
    y: VLMAxis


class VLMResponse(BaseModel):
    axes: VLMAxes
    curves: list[VLMCurve] = Field(default_factory=list)
    notes: str = ""


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    hint: str = ""


class ApiError(BaseModel):
    error: ApiErrorDetail


class SettingsPublic(BaseModel):
    active_provider: ProviderName
    providers: list[dict[str, Any]]


class SettingsUpdate(BaseModel):
    active_provider: ProviderName | None = None
    provider: ProviderName | None = None
    api_key: str | None = None


class CalibrationUpdate(BaseModel):
    calibration: Calibration


class RefineRequest(BaseModel):
    region: BBox | None = None
    instruction: str | None = None
    curve_id: str | None = None
    redetect_curve: bool = False


class ResampleRequest(BaseModel):
    curve_id: str
    target_count: int = 50


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
