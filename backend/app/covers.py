"""Covers that did not come out of the book file."""

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
