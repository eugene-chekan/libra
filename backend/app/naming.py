"""Turning what somebody typed into a canonical form.

Two unrelated rules, both about names: the filename a book is downloaded as,
and the folded form that decides when two tag or shelf names are the same one.
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


def fold_name(name: str) -> str:
    """The form two tag or shelf names must share to count as the same name.

    `casefold` rather than `lower` because it folds every alphabet, matching
    the search fix in `app/db.py`; SQLite's own `NOCASE` folded the 26 ASCII
    letters and left "Фантастика" and "фантастика" as two different tags.

    NFC first because "é" can arrive as one character or as an "e" and a
    combining accent, depending on the device it was typed on, and those two
    names look identical to the person reading them.

    Args:
        name: The name as it was typed.

    Returns:
        The folded form. For matching only — never shown to anyone.
    """
    return unicodedata.normalize("NFC", name).casefold()
