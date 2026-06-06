from __future__ import annotations

import base64

from openai import OpenAI

from app.models.schemas import BBox, Curve, VLMResponse
from app.vlm.base import VLMError, build_detect_prompt, build_refine_prompt, parse_vlm_response


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
