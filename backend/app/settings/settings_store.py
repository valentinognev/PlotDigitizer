from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

from app.models.schemas import ProviderName

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "settings.json"
PROVIDERS: list[ProviderName] = ["openai", "anthropic", "gemini"]


class SettingsData(BaseModel):
    active_provider: ProviderName = "openai"
    keys: dict[str, str] = Field(
        default_factory=lambda: {p: "" for p in PROVIDERS}
    )


class SettingsStore:
    def __init__(self, path: Path = CONFIG_PATH) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def _load(self) -> SettingsData:
        if not self.path.exists():
            data = SettingsData()
            self._save(data)
            return data
        raw = json.loads(self.path.read_text())
        return SettingsData(**raw)

    def _save(self, data: SettingsData) -> None:
        self.path.write_text(data.model_dump_json(indent=2))

    def reload(self) -> SettingsData:
        self._data = self._load()
        return self._data

    def get(self) -> SettingsData:
        return self._data

    def public_view(self) -> dict:
        data = self._data
        return {
            "active_provider": data.active_provider,
            "providers": [
                {"name": p, "has_key": bool(data.keys.get(p, "").strip())}
                for p in PROVIDERS
            ],
        }

    def update(
        self,
        *,
        active_provider: ProviderName | None = None,
        provider: ProviderName | None = None,
        api_key: str | None = None,
    ) -> SettingsData:
        if active_provider is not None:
            self._data.active_provider = active_provider
        if provider is not None and api_key is not None:
            self._data.keys[provider] = api_key
        self._save(self._data)
        return self._data

    def clear_key(self, provider: ProviderName) -> SettingsData:
        self._data.keys[provider] = ""
        self._save(self._data)
        return self._data

    def active_key(self) -> str:
        return self._data.keys.get(self._data.active_provider, "").strip()

    def has_active_key(self) -> bool:
        return bool(self.active_key())


settings_store = SettingsStore()
