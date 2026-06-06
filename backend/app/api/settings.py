from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import ProviderName, SettingsPublic, SettingsUpdate
from app.settings.settings_store import settings_store

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsPublic)
def get_settings() -> SettingsPublic:
    data = settings_store.public_view()
    return SettingsPublic(**data)


@router.put("", response_model=SettingsPublic)
def update_settings(body: SettingsUpdate) -> SettingsPublic:
    settings_store.update(
        active_provider=body.active_provider,
        provider=body.provider,
        api_key=body.api_key,
    )
    return SettingsPublic(**settings_store.public_view())


@router.delete("/key/{provider}", response_model=SettingsPublic)
def clear_key(provider: ProviderName) -> SettingsPublic:
    settings_store.clear_key(provider)
    return SettingsPublic(**settings_store.public_view())
