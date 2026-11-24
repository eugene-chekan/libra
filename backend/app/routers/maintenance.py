from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session

from app import maintenance
from app.auth import require_admin
from app.config import Settings, get_settings
from app.db import get_session
from app.logging_config import get_logger
from app.models import MaintenanceReport, User

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

log = get_logger(__name__)


@router.get("", response_model=MaintenanceReport)
def get_report(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _: User = Depends(require_admin),
) -> MaintenanceReport:
    """What this installation holds, and what has come loose from it."""
    return maintenance.report(session, settings)


@router.post("/prune-sessions")
def prune_sessions(
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> dict[str, int]:
    """Remove the sessions that have already expired."""
    removed = maintenance.prune_sessions(session)
    log.info(
        "%s pruned %d expired sessions",
        admin.username,
        removed,
        extra={"event": "sessions_pruned", "removed": removed, "by_user_id": admin.id},
    )
    return {"removed": removed}


@router.post("/vacuum")
def vacuum(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
) -> dict[str, int]:
    """Give back the space deleted rows left behind, and say how much that was."""
    reclaimed = maintenance.vacuum(session, settings)
    log.info(
        "%s compacted the database, %d bytes back",
        admin.username,
        reclaimed,
        extra={"event": "database_vacuumed", "reclaimed_bytes": reclaimed, "by_user_id": admin.id},
    )
    return {"reclaimed_bytes": reclaimed}


@router.delete("/orphans/{name}", status_code=204)
def delete_orphan(
    name: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    admin: User = Depends(require_admin),
) -> Response:
    """Remove one file that no book points at."""
    try:
        maintenance.delete_orphan(session, name, settings)
    except maintenance.OrphanNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No such file in the library") from exc
    except maintenance.FileStillInUseError as exc:
        raise HTTPException(status_code=409, detail="A book points at that file") from exc
    log.info(
        "%s deleted the stray file %s",
        admin.username,
        name,
        extra={"event": "orphan_deleted", "file": name, "by_user_id": admin.id},
    )
    return Response(status_code=204)
