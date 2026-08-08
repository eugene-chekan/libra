from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import library
from app.auth import current_user
from app.db import get_session
from app.models import TagCreate, TagRead, TagUpdate, User

router = APIRouter(prefix="/tags", tags=["tags"])

# Two kinds of tag. Global ones (owner_id NULL) are curated by admins and
# visible to everyone; personal ones belong to a reader and to nobody else.


@router.get("", response_model=list[TagRead])
def list_tags(
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> list[TagRead]:
    """The caller's visible vocabulary: global tags, then their own."""
    return library.list_tags(session, user)


@router.post("", response_model=TagRead, status_code=201)
def create_tag(
    tag: TagCreate,
    make_global: bool = False,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> TagRead:
    """Create a tag. `?make_global=true` is admin-only.

    Global tag assignment is global, so letting any reader mint one would
    change what the whole household sees. Restricting it keeps the shared
    vocabulary curated — and is far easier to relax later than to tighten.
    """
    try:
        return library.create_tag(session, user, tag.name, is_global=make_global)
    except library.TagNotEditableError as exc:
        raise HTTPException(status_code=403, detail="Only an admin can manage global tags") from exc
    except library.ShadowsGlobalTagError as exc:
        raise HTTPException(status_code=409, detail="A global tag already uses that name") from exc
    except library.DuplicateTagNameError as exc:
        raise HTTPException(
            status_code=409, detail="You already have a tag with that name"
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(
    tag_id: int,
    update: TagUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> TagRead:
    """Rename a tag. Renaming moves nothing — books reference it by id."""
    if update.name is None:
        raise HTTPException(status_code=422, detail="Nothing to update")
    try:
        return library.update_tag(session, tag_id, user, update.name)
    except library.TagNotVisibleError as exc:
        raise HTTPException(status_code=404, detail="Tag not found") from exc
    except library.TagNotEditableError as exc:
        raise HTTPException(status_code=403, detail="Only an admin can manage global tags") from exc
    except library.ShadowsGlobalTagError as exc:
        raise HTTPException(status_code=409, detail="A global tag already uses that name") from exc
    except library.DuplicateTagNameError as exc:
        raise HTTPException(
            status_code=409, detail="You already have a tag with that name"
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> None:
    """Delete a tag and remove it from every book it was on."""
    try:
        library.delete_tag(session, tag_id, user)
    except library.TagNotVisibleError as exc:
        raise HTTPException(status_code=404, detail="Tag not found") from exc
    except library.TagNotEditableError as exc:
        raise HTTPException(status_code=403, detail="Only an admin can manage global tags") from exc
