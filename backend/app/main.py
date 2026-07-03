from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import sessions
from app.store.session_store import session_store

app = FastAPI(title="PlotDigitizer API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)


@app.on_event("startup")
def startup() -> None:
    restored = session_store.restore_last()
    if restored is not None:
        print(f"Restored last session {restored.session.id}")  # noqa: T201


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal", "message": str(exc), "hint": ""}},
    )
