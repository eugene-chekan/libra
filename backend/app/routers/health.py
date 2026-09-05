from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.version import VERSION

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Whether this instance is up, and which one it is."""
    reply = {"status": "ok", "version": VERSION}
    if settings.build:
        reply["build"] = settings.build
    return reply
