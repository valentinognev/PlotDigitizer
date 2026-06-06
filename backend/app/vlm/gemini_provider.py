from __future__ import annotations

import google.generativeai as genai

from app.models.schemas import BBox, Curve, VLMResponse
from app.vlm.base import DETECT_PROMPT, REFINE_PROMPT, VLMError, parse_vlm_response


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash") -> None:
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)

    def _call(self, image: bytes, prompt: str) -> str:
        try:
            response = self.model.generate_content(
                [
                    {"mime_type": "image/png", "data": image},
                    prompt,
                ]
            )
        except Exception as exc:
            raise VLMError("vlm_network", str(exc), "Check API key and network") from exc
        return response.text or ""

    def _repair(self, broken: str) -> str:
        response = self.model.generate_content(f"Fix this into valid JSON only:\n{broken}")
        return response.text or ""

    def detect(self, image: bytes, *, scale_factor: float = 1.0) -> VLMResponse:
        text = self._call(image, DETECT_PROMPT)
        return parse_vlm_response(text, repair_fn=self._repair)

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
            parts.append(f"Region: {region.model_dump()}")
        text = self._call(image, "\n".join(parts))
        return parse_vlm_response(text, repair_fn=self._repair)
