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
        scale_factor: float = 1.0,
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


DETECT_PROMPT = """Analyze this plot image and return ONLY valid JSON (no markdown) with this schema:
{
  "axes": {
    "x": { "scale": "linear"|"log", "ticks": [{"pixel": [x,y], "value": number}, ...] },
    "y": { "scale": "linear"|"log", "ticks": [{"pixel": [x,y], "value": number}, ...] }
  },
  "curves": [
    {
      "label": "string",
      "color_hex": "#rrggbb",
      "style": "solid"|"dashed"|"dotted"|"unknown",
      "seed_points": [[x,y], ...]
    }
  ],
  "notes": "string"
}
Use image pixel coordinates. Provide at least 2 ticks per axis and sparse seed_points along each curve."""

REFINE_PROMPT = """Analyze this plot image region/instruction and return ONLY valid JSON for curves to add or correct.
Schema:
{
  "axes": { "x": {"scale":"linear","ticks":[]}, "y": {"scale":"linear","ticks":[]} },
  "curves": [ { "label": "", "color_hex": "#rrggbb", "style": "solid", "seed_points": [[x,y]] } ],
  "notes": ""
}
If axes unchanged, return empty tick arrays. Focus on requested curves only."""
