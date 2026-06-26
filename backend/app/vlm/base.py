from __future__ import annotations

import json
import re
from typing import Protocol

from app.models.schemas import BBox, Curve, VLMResponse


class VLMError(Exception):
    def __init__(self, code: str, message: str, hint: str = "") -> None:
        self.code = code
        self.message = message
        self.hint = hint
        super().__init__(message)


class VLMProvider(Protocol):
    def detect(self, image: bytes, *, scale_factor: float = 1.0) -> VLMResponse: ...

    def refine(
        self,
        image: bytes,
        *,
        region: BBox | None = None,
        instruction: str | None = None,
        existing: list[Curve] | None = None,
        hint_curve: Curve | None = None,
        hint_points: list[tuple[float, float]] | None = None,
        scale_factor: float = 1.0,
        image_width: int | None = None,
        image_height: int | None = None,
    ) -> VLMResponse: ...


def extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise VLMError("vlm_malformed", "VLM response is not valid JSON", "Retry detection")
        return json.loads(match.group())


def parse_vlm_response(text: str, *, repair_fn=None) -> VLMResponse:
    try:
        data = extract_json(text)
        return VLMResponse.model_validate(data)
    except Exception as first_exc:
        if repair_fn is None:
            raise VLMError(
                "vlm_malformed",
                f"Failed to parse VLM response: {first_exc}",
                "Retry detection",
            ) from first_exc
        try:
            repaired = repair_fn(text)
            data = extract_json(repaired)
            return VLMResponse.model_validate(data)
        except Exception as second_exc:
            raise VLMError(
                "vlm_malformed",
                f"Failed to parse VLM response after repair: {second_exc}",
                "Retry detection",
            ) from second_exc


_DETECT_PROMPT_BODY = """Analyze this plot image and return ONLY valid JSON (no markdown) with this schema:
{
  "axes": {
    "x": { "scale": "linear"|"log", "ticks": [{"pixel": [x,y], "value": number}, ...] },
    "y": { "scale": "linear"|"log", "ticks": [{"pixel": [x,y], "value": number}, ...] }
  },
  "curves": [],
  "notes": "string"
}
Rules:
- Use absolute pixel coordinates in the attached image (origin top-left).
- Do NOT detect curves. Always return an empty curves array.
- Read axis tick labels only. Provide at least 2 ticks per axis with accurate numeric values.
- Include ticks at the plot edges so X min, X max, Y min, and Y max can be determined."""


def build_detect_prompt(width: int, height: int) -> str:
    return (
        f"The image is exactly {width}x{height} pixels. "
        f"All pixel x must be in [0, {width - 1}] and y in [0, {height - 1}].\n"
        + _DETECT_PROMPT_BODY
    )


DETECT_PROMPT = build_detect_prompt(800, 600)

REFINE_PROMPT = """Analyze this plot image region/instruction and return ONLY valid JSON for curves to add or correct.
Schema:
{
  "axes": { "x": {"scale":"linear","ticks":[]}, "y": {"scale":"linear","ticks":[]} },
  "curves": [ { "label": "", "color_hex": "#rrggbb", "style": "solid", "seed_points": [[x,y]] } ],
  "notes": ""
}
If axes unchanged, return empty tick arrays. Focus on requested curves only."""


def build_improve_from_hints_prompt(
    width: int,
    height: int,
    curve: Curve,
    hint_points: list[tuple[float, float]],
    *,
    target_point_count: int | None = None,
) -> str:
    from app.cv.order import order_points_along_curve

    ordered = order_points_along_curve(hint_points)
    pts_json = json.dumps([[round(x, 1), round(y, 1)] for x, y in ordered])
    trace_color = curve.trace_color or curve.color
    target = target_point_count if target_point_count is not None else curve.target_point_count
    seed_hint = min(max(4, target // 3), 12)
    return (
        f"The image is exactly {width}x{height} pixels. "
        f"All pixel x must be in [0, {width - 1}] and y in [0, {height - 1}].\n"
        f'The user corrected pixel positions on the curve "{curve.label}":\n'
        f"{pts_json}\n"
        "Return ONLY valid JSON (no markdown):\n"
        "{\n"
        '  "axes": { "x": {"scale":"linear","ticks":[]}, "y": {"scale":"linear","ticks":[]} },\n'
        '  "curves": [\n'
        "    {\n"
        f'      "label": "{curve.label}",\n'
        f'      "color_hex": "{trace_color}",\n'
        f'      "style": "{curve.style}",\n'
        '      "seed_points": [[x,y], ...]\n'
        "    }\n"
        "  ],\n"
        '  "notes": ""\n'
        "}\n"
        "Rules:\n"
        "- Trace the visible line in the image that best matches the user's corrected points.\n"
        "- The line must pass near every hint point; extend seed_points along the full visible "
        "extent of that line.\n"
        f"- Return about {seed_hint} seed_points spread along the curve (not more than {seed_hint}).\n"
        f"- The final curve will be resampled to {target} points.\n"
        "- Use absolute pixel coordinates in the attached image (origin top-left)."
    )


def build_refine_prompt(
    *,
    width: int,
    height: int,
    region: BBox | None = None,
    instruction: str | None = None,
    existing: list[Curve] | None = None,
    hint_curve: Curve | None = None,
    hint_points: list[tuple[float, float]] | None = None,
) -> str:
    if hint_curve is not None and hint_points:
        return build_improve_from_hints_prompt(width, height, hint_curve, hint_points)

    parts = [
        f"The image is exactly {width}x{height} pixels. "
        f"All pixel x must be in [0, {width - 1}] and y in [0, {height - 1}].\n",
        REFINE_PROMPT,
    ]
    if instruction:
        parts.append(f"Instruction: {instruction}")
    if region:
        parts.append(
            f"Focus region bbox: x={region.x}, y={region.y}, "
            f"w={region.width}, h={region.height}"
        )
    if existing:
        labels = ", ".join(c.label for c in existing)
        parts.append(f"Existing curves: {labels}")
    return "\n".join(parts)
