from __future__ import annotations

import base64

from openai import OpenAI

from app.models.schemas import BBox, Curve, VLMResponse
from app.vlm.base import DETECT_PROMPT, REFINE_PROMPT, VLMError, parse_vlm_response


class OpenAIProvider:
    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def _call(self, image: bytes, prompt: str) -> str:
        b64 = base64.b64encode(image).decode("ascii")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}"},
                            },
                        ],
                    }
                ],
                max_tokens=4096,
            )
        except Exception as exc:
            raise VLMError("vlm_network", str(exc), "Check API key and network") from exc
        content = response.choices[0].message.content or ""
        return content

    def _repair(self, broken: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": f"Fix this into valid JSON only:\n{broken}",
                }
            ],
            max_tokens=4096,
        )
        return response.choices[0].message.content or ""

    def detect(self, image: bytes, *, scale_factor: float = 1.0) -> VLMResponse:
        text = self._call(image, DETECT_PROMPT)
        resp = parse_vlm_response(text, repair_fn=self._repair)
        return self._scale_response(resp, scale_factor)

    def refine(
        self,
        image: bytes,
        *,
        region: BBox | None = None,
        instruction: str | None = None,
        existing: list[Curve] | None = None,
        scale_factor: float = 1.0,
    ) -> VLMResponse:
        parts = [REFINE_PROMPT]
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
        text = self._call(image, "\n".join(parts))
        resp = parse_vlm_response(text, repair_fn=self._repair)
        return self._scale_response(resp, scale_factor)

    def _scale_response(self, resp: VLMResponse, scale_factor: float) -> VLMResponse:
        if scale_factor == 1.0:
            return resp
        inv = 1.0 / scale_factor
        for tick in resp.axes.x.ticks:
            tick.pixel = (tick.pixel[0] * inv, tick.pixel[1] * inv)
        for tick in resp.axes.y.ticks:
            tick.pixel = (tick.pixel[0] * inv, tick.pixel[1] * inv)
        for curve in resp.curves:
            curve.seed_points = [(x * inv, y * inv) for x, y in curve.seed_points]
        return resp
