from __future__ import annotations

from app.models.schemas import ProviderName
from app.settings.settings_store import settings_store
from app.vlm.anthropic_provider import AnthropicProvider
from app.vlm.base import VLMError, VLMProvider
from app.vlm.gemini_provider import GeminiProvider
from app.vlm.openai_provider import OpenAIProvider


def get_provider(provider: ProviderName | None = None, api_key: str | None = None) -> VLMProvider:
    data = settings_store.get()
    name = provider or data.active_provider
    key = (api_key or data.keys.get(name, "")).strip()
    if not key:
        raise VLMError(
            "api_key_missing",
            "API key not set — open Settings.",
            "Add your VLM API key in Settings.",
        )
    if name == "openai":
        return OpenAIProvider(key)
    if name == "anthropic":
        return AnthropicProvider(key)
    if name == "gemini":
        return GeminiProvider(key)
    raise VLMError("provider_unknown", f"Unknown provider: {name}")
