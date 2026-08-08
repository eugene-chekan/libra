from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import library
from app.auth import current_user
from app.db import get_session
from app.models import ShelfCreate, ShelfOrder, ShelfRead, ShelfUpdate, User

router = APIRouter(prefix="/shelves", tags=["shelves"])

# Shelves belong to readers. Everyone may look at a public one; only its owner
# may change it, rename it, reorder it, or decide what sits on it.


def _visible_or_404(exc: Exception) -> HTTPException:
    """`404`, never `403`, for a shelf the caller cannot see.

    A `403` would confirm the shelf exists, which is enough to enumerate
    another reader's private shelves by walking ids.
    """
    return HTTPException(status_code=404, detail="Shelf not found")


@router.get("", response_model=list[ShelfRead])
def list_shelves(
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ShelfRead]:
    """The caller's shelves in their order, followed by others' public ones."""
    return library.list_shelves(session, user)


@router.post("", response_model=ShelfRead, status_code=201)
def create_shelf(
    shelf: ShelfCreate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> ShelfRead:
    if not shelf.name.strip():
        raise HTTPException(status_code=422, detail="Shelf name must not be empty")
    try:
        return library.create_shelf(session, user, shelf.name, shelf.visibility)
    except library.DuplicateShelfNameError as exc:
        raise HTTPException(
            status_code=409, detail="You already have a shelf with that name"
        ) from exc


@router.put("/order", response_model=list[ShelfRead])
def reorder_shelves(
    order: ShelfOrder,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> list[ShelfRead]:
    """Rewrite the caller's shelf order from a complete list.

    Declared before `/{shelf_id}` so that "order" is not matched as an id.
    """
    try:
        return library.reorder_shelves(session, user, order.shelf_ids)
    except library.InvalidShelfOrderError as exc:
        raise HTTPException(
            status_code=422,
            detail="The list must contain exactly your own shelves, each once",
        ) from exc


@router.get("/{shelf_id}", response_model=ShelfRead)
def get_shelf(
    shelf_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> ShelfRead:
    try:
        return library.get_shelf(session, shelf_id, user)
    except library.ShelfNotVisibleError as exc:
        raise _visible_or_404(exc) from exc


@router.patch("/{shelf_id}", response_model=ShelfRead)
def update_shelf(
    shelf_id: int,
    update: ShelfUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> ShelfRead:
    """Rename a shelf or publish it. Owner only.

    Renaming moves no books: they reference the shelf by id, which is the
    whole point of shelves being entities rather than matched names.
    """
    try:
        return library.update_shelf(session, shelf_id, user, update.model_dump(exclude_unset=True))
    except library.ShelfNotVisibleError as exc:
        raise _visible_or_404(exc) from exc
    except library.ShelfNotOwnedError as exc:
        raise HTTPException(status_code=403, detail="This shelf belongs to someone else") from exc
    except library.DuplicateShelfNameError as exc:
        raise HTTPException(
            status_code=409, detail="You already have a shelf with that name"
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{shelf_id}", status_code=204)
def delete_shelf(
    shelf_id: int,
    reassign_to: int | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> None:
    """Delete a shelf, optionally moving its books to another of yours first.

    Omitting `reassign_to` leaves those books unshelved, which is a valid
    state — rather than silently moving them somewhere the reader did not
    choose.
    """
    try:
        library.delete_shelf(session, shelf_id, user, reassign_to=reassign_to)
    except library.ShelfNotVisibleError as exc:
        raise _visible_or_404(exc) from exc
    except library.ShelfNotOwnedError as exc:
        raise HTTPException(status_code=403, detail="This shelf belongs to someone else") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
