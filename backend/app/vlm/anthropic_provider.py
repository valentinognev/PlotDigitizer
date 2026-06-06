from __future__ import annotations

import base64

from anthropic import Anthropic

from app.models.schemas import BBox, Curve, VLMResponse
from app.vlm.base import VLMError, build_detect_prompt, build_refine_prompt, parse_vlm_response


class AnthropicProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514") -> None:
        self.client = Anthropic(api_key=api_key)
        self.model = model

    def _call(self, image: bytes, prompt: str) -> str:
        b64 = base64.b64encode(image).decode("ascii")
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )
        except Exception as exc:
            raise VLMError("vlm_network", str(exc), "Check API key and network") from exc
        parts = [b.text for b in response.content if hasattr(b, "text")]
        return "\n".join(parts)

    def _repair(self, broken: str) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": f"Fix this into valid JSON only:\n{broken}"}],
        )
        parts = [b.text for b in response.content if hasattr(b, "text")]
        return "\n".join(parts)

    def detect(
        self,
        image: bytes,
        *,
        scale_factor: float = 1.0,
        image_width: int | None = None,
        image_height: int | None = None,
    ) -> VLMResponse:
        w = image_width or 800
        h = image_height or 600
        text = self._call(image, build_detect_prompt(w, h))
        return parse_vlm_response(text, repair_fn=self._repair)

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
    ) -> VLMResponse:
        w = image_width or 800
        h = image_height or 600
        prompt = build_refine_prompt(
            width=w,
            height=h,
            region=region,
            instruction=instruction,
            existing=existing,
            hint_curve=hint_curve,
            hint_points=hint_points,
        )
        text = self._call(image, prompt)
        return parse_vlm_response(text, repair_fn=self._repair)
