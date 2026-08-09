"""Rebuilding a readable filename from catalog metadata.

These tests moved here from test_kindle.py when the function left mailer.py.
They matter more now than they did then: the result reaches a
`Content-Disposition` header as well as a MIME part, so a newline surviving
the filter is a header-injection primitive rather than only an ugly filename
on a device.
"""

import pytest

from app.naming import MAX_FILENAME_STEM, book_filename


@pytest.mark.parametrize(
    ("title", "author", "expected"),
    [
        ("Dune", "Frank Herbert", "Dune - Frank Herbert.epub"),
        # Path separators must never reach a filename, and the leading dots
        # go too — a name beginning with a dot is hidden on some systems and
        # is never what a book is called.
        ("../../etc/passwd", "A", "etc passwd - A.epub"),
        ("A\\B", "C", "A B - C.epub"),
        # Control characters, including the newline that would otherwise let a
        # filename inject a header.
        ("Line\nBreak", "A", "Line Break - A.epub"),
        ("Tab\tHere", "A", "Tab Here - A.epub"),
        ("Null\x00Byte", "A", "Null Byte - A.epub"),
        # A carriage return is the other half of CRLF injection.
        ("Carriage\rReturn", "A", "Carriage Return - A.epub"),
        # Non-ASCII is kept, not stripped; the transport layer encodes it.
        ("Café", "Zoë", "Café - Zoë.epub"),
        # A title of nothing but separators would sanitise to empty.
        ("///", "   ", "book.epub"),
        # A missing author still produces something readable, since the
        # parser falls back to "Unknown" rather than an empty string only
        # when it can — a hand-created row can be blank.
        ("Solo", "", "Solo.epub"),
    ],
)
def test_filenames_are_sanitised(title: str, author: str, expected: str) -> None:
    assert book_filename(title, author) == expected


def test_filenames_are_length_capped() -> None:
    name = book_filename("T" * 500, "A" * 500)

    assert len(name) <= MAX_FILENAME_STEM + len(".epub")
    assert name.endswith(".epub")


def test_a_combining_sequence_is_normalised_before_filtering() -> None:
    """NFC first, so a decomposed character cannot render unpredictably on the
    receiving end.

    Built with chr() rather than written as literals: the composed and
    decomposed forms are indistinguishable in a source file, so a test typed
    the obvious way would silently be comparing a string to itself and would
    keep passing with the normalisation removed.
    """
    decomposed = "Cafe" + chr(0x0301)  # e + COMBINING ACUTE ACCENT
    composed = "Caf" + chr(0x00E9)  # precomposed e-acute
    assert decomposed != composed

    assert book_filename(decomposed, "A") == f"{composed} - A.epub"


def test_the_suffix_is_caller_supplied() -> None:
    """Format conversion will want the same name with a different extension."""
    assert book_filename("Dune", "Frank Herbert", ".azw3") == "Dune - Frank Herbert.azw3"
