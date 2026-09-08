"""Covers that did not come out of the book file."""

from pathlib import Path
from typing import BinaryIO

from app import storage

# The longest marker below sits at offset 8 and runs 4 bytes, so 12 decides
# every format. Read a few more so a caller has something to log.
SNIFF_BYTES = 16


def sniff_media_type(head: bytes) -> str | None:
    """What this picture actually is, judged from its first bytes.

    A `Content-Type` header is written by whoever sent the file, and a suffix
    by whoever named it. Neither is evidence.

    Args:
        head: At least `SNIFF_BYTES` from the start of the file.

    Returns:
        A member of `COVER_MEDIA_TYPES`, or None when it is not one of them.
    """
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    # RIFF is a container for several formats; only the WebP one is a picture.
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"
    return None


class NotAnImageError(ValueError):
    """The bytes are not a picture this app accepts."""


# Kept apart from the library root on purpose: `maintenance.report` treats any
# file sitting directly in the root that no book row points at as an orphan and
# offers to delete it. A cover stored beside the books would be offered, and
# taken. See docs/specs/book-covers.md.
COVERS_SUBDIR = "covers"

SUFFIXES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def store(source: BinaryIO, library_dir: Path, max_bytes: int) -> tuple[str, str]:
    """Write a cover into the library; returns its path and what it is.

    Args:
        source: The incoming stream.
        library_dir: The library root.
        max_bytes: Ceiling, counted on the stream.

    Returns:
        The path relative to `library_dir`, and the media type.

    Raises:
        NotAnImageError: The bytes are not an accepted picture.
        UploadTooLargeError: The stream went over the ceiling.
    """
    staged = storage.stage_upload(source, library_dir, max_bytes)
    try:
        with staged.path.open("rb") as stored:
            media_type = sniff_media_type(stored.read(SNIFF_BYTES))
        if media_type is None:
            raise NotAnImageError("not a JPEG, PNG, GIF or WebP")
    except BaseException:
        staged.discard()
        raise

    relative = storage.commit(staged, library_dir, SUFFIXES[media_type], COVERS_SUBDIR)
    return relative, media_type


def remove(relative_path: str, library_dir: Path) -> bool:
    """Delete a stored cover; returns whether a file was actually removed."""
    return storage.delete(relative_path, library_dir)
