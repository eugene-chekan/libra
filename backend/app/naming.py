"""Human-readable filenames rebuilt from catalog metadata."""

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

    Args:
        title: Book title, from the catalog rather than the uploader.
        author: Book author, likewise.
        suffix: File extension, including the dot.
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
