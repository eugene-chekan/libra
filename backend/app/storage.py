"""Local filesystem storage for ebook files."""

import hashlib
import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from app.logging_config import get_logger

CHUNK_BYTES = 1024 * 1024

log = get_logger(__name__)


class UploadTooLargeError(ValueError):
    """Raised when an upload exceeds the configured ceiling."""


@dataclass
class StagedUpload:
    """An upload written to a temporary file, not yet committed to the library."""

    path: Path
    size_bytes: int
    sha256: str

    def discard(self) -> None:
        self.path.unlink(missing_ok=True)


def stage_upload(source: BinaryIO, library_dir: Path, max_bytes: int) -> StagedUpload:
    """Stream `source` to a temp file inside `library_dir`, hashing as we go.

    Args:
        source: The incoming stream.
        library_dir: Where the temporary file is written, so committing is a
            rename rather than a copy.
        max_bytes: Ceiling, counted on the stream rather than trusted from a
            header.

    Raises:
        UploadTooLargeError: The stream went over the ceiling.
    """
    library_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    size = 0

    fd, temp_name = tempfile.mkstemp(dir=library_dir, suffix=".part")
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as sink:
            while chunk := source.read(CHUNK_BYTES):
                size += len(chunk)
                if size > max_bytes:
                    raise UploadTooLargeError(f"upload exceeds {max_bytes} bytes")
                digest.update(chunk)
                sink.write(chunk)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise

    return StagedUpload(path=temp_path, size_bytes=size, sha256=digest.hexdigest())


def commit(staged: StagedUpload, library_dir: Path, suffix: str = ".epub") -> str:
    """Promote a staged upload to its permanent name; returns the relative path.

    Args:
        staged: What `stage_upload` produced.
        library_dir: The library root.
        suffix: File extension to store it under.

    Returns:
        The stored name, relative to `library_dir`.
    """
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    destination = library_dir / stored_name
    # Same-filesystem rename by construction (see stage_upload), but fall back
    # to a copy so an exotic setup with a bind-mounted tmpdir still works.
    try:
        os.replace(staged.path, destination)
    except OSError:
        # The staging file was supposed to be on the same filesystem as the
        # library, making this a rename. If it is not, we are now copying
        # whole books instead — slower, and no longer atomic. Worth knowing
        # about, since it points at a misconfigured mount rather than a bug
        # in this request.
        log.warning(
            "Cross-filesystem commit: %s could not be renamed into the library, "
            "falling back to a copy. Is library_dir on a different mount from "
            "the system temp directory?",
            staged.path,
        )
        shutil.move(str(staged.path), str(destination))
    return stored_name


def resolve(relative_path: str, library_dir: Path) -> Path:
    """Map a stored relative path back to an absolute one.

    Args:
        relative_path: A path as stored on a `Book` row.
        library_dir: The library root.

    Raises:
        PathTraversalError: The path escapes the library.
    """
    root = library_dir.resolve()
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"{relative_path!r} escapes the library directory")
    return candidate


def delete(relative_path: str, library_dir: Path) -> bool:
    """Remove a stored file.

    Args:
        relative_path: A path as stored on a `Book` row.
        library_dir: The library root.

    Returns:
        Whether a file was actually removed.
    """
    try:
        target = resolve(relative_path, library_dir)
    except ValueError:
        # A stored path pointing outside the library means a row was written
        # with a hand-supplied file_path. The traversal guard did its job;
        # the row is still worth looking at.
        log.warning(
            "Refused to delete %r: it resolves outside the library directory.",
            relative_path,
        )
        return False

    if not target.is_file():
        log.warning(
            "Nothing to delete at %r: the row referenced a file that is not on disk.",
            relative_path,
        )
        return False

    target.unlink()
    return True
