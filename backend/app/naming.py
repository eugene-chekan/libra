"""Human-readable filenames rebuilt from catalog metadata.

Stored files carry generated UUID names, deliberately, so that a
client-supplied filename never touches the filesystem. That protection has to
stop at the point where a file leaves the server: a Kindle listing
`9f2c1a….epub`, or a browser saving it under that name, is a bad outcome.

So the readable name is reconstructed here from the catalog fields rather than
recovered from `book_metadata["original_filename"]` — which is the name the
uploader chose and is therefore exactly the untrusted string this module
exists to avoid handling.

Both callers put the result into a header a client parses: `Content-Type` /
`Content-Disposition` for a download, a MIME part header for mail. Same class
of problem, same sanitising, one implementation.
"""

import re
import unicodedata

# Path separators and control characters must not reach a filename. The
# newline matters most: unescaped, it is what lets a filename inject a header.
_UNSAFE_FILENAME = re.compile(r"[\\/\x00-\x1f\x7f]")
_COLLAPSE_WHITESPACE = re.compile(r"\s+")

# Long enough for any real title, short enough to stay clear of filesystem
# and header limits on the receiving end.
MAX_FILENAME_STEM = 120


def book_filename(title: str, author: str, suffix: str = ".epub") -> str:
    """A safe, readable filename for one book.

    Non-ASCII is kept rather than stripped — `EmailMessage.add_attachment`
    handles RFC 2231 encoding, and `FileResponse` handles RFC 5987 — so a
    title in Cyrillic or with an accent survives instead of being mangled into
    ASCII soup.
    """
    stem = f"{title} - {author}".strip(" -")
    # Normalise first: a combining sequence can otherwise survive the filter
    # and render unpredictably on the receiving end.
    stem = unicodedata.normalize("NFC", stem)
    stem = _UNSAFE_FILENAME.sub(" ", stem)
    stem = _COLLAPSE_WHITESPACE.sub(" ", stem).strip(" .")
    stem = stem[:MAX_FILENAME_STEM].strip(" .")

    # A title of nothing but separators sanitises to empty; a nameless file is
    # worse than a dull one.
    return f"{stem or 'book'}{suffix}"
