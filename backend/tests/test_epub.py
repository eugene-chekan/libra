from pathlib import Path

import pytest

from app.epub import InvalidEpubError, read_metadata
from tests.epub_factory import build_epub


def test_reads_core_metadata(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "dune.epub")
    meta = read_metadata(path, fallback_title="ignored")

    assert meta.title == "Dune"
    assert meta.author == "Frank Herbert"
    assert meta.extra["language"] == "en"
    assert meta.extra["publisher"] == "Ace Books"
    assert meta.extra["published"] == "1965-08-01"
    assert meta.extra["identifiers"] == ["urn:isbn:9780441013593"]
    assert meta.extra["subjects"] == ["Science Fiction"]
    assert meta.year == 1965
    assert meta.blurb == "Desert planet politics."
    # Promoted to a column; leaving a copy in the blob too would give an admin
    # edit two places to disagree.
    assert "description" not in meta.extra


@pytest.mark.parametrize(
    ("published", "expected"),
    [
        ("1965-08-01", 1965),
        ("1965", 1965),
        ("2011-01-01T00:00:00+00:00", 2011),
        ("1965-08-01T00:00:00Z", 1965),
        ("August 1965", 1965),  # non-conformant but unambiguous
        ("01/08/1965", 1965),
        ("0101-01-01T00:00:00+00:00", None),  # Calibre's "date unknown" sentinel
        ("20110101", None),  # malformed, not the year 2011
        ("9999", None),  # beyond plausible
        ("n.d.", None),
    ],
)
def test_year_parsing(tmp_path: Path, published: str, expected: int | None) -> None:
    meta = read_metadata(build_epub(tmp_path / "y.epub", published=published), fallback_title="x")

    assert meta.year == expected
    # The raw string survives even when the year does not, so a blank year is
    # always traceable to what the file actually said.
    assert meta.extra["published"] == published


def test_year_is_absent_without_a_date(tmp_path: Path) -> None:
    meta = read_metadata(build_epub(tmp_path / "n.epub", published=None), fallback_title="n")

    assert meta.year is None
    assert "published" not in meta.extra


def test_prefers_the_publication_dated_element(tmp_path: Path) -> None:
    """OPF 2 permits several dc:date elements; document order is not the rule."""
    path = build_epub(
        tmp_path / "epub2.epub",
        published=None,
        extra_meta=[
            '<dc:date opf:event="modification">2026-07-01</dc:date>',
            '<dc:date opf:event="publication">1965-08-01</dc:date>',
        ],
    )

    assert read_metadata(path, fallback_title="x").year == 1965


def test_ignores_file_lifecycle_dates(tmp_path: Path) -> None:
    """A re-export timestamp is not a publication year: a 1965 novel round
    tripped through Calibre last week is not a 2026 book."""
    path = build_epub(
        tmp_path / "mod.epub",
        published=None,
        extra_meta=['<dc:date opf:event="modification">2026-07-01</dc:date>'],
    )
    meta = read_metadata(path, fallback_title="x")

    assert meta.year is None
    assert "published" not in meta.extra


def test_reads_declared_page_count(tmp_path: Path) -> None:
    assert (
        read_metadata(build_epub(tmp_path / "p.epub", pages="412"), fallback_title="p").pages == 412
    )


def test_tolerates_whitespace_around_the_page_count(tmp_path: Path) -> None:
    """Pretty-printed OPFs put indentation in the text node."""
    meta = read_metadata(build_epub(tmp_path / "w.epub", pages="  412\n"), fallback_title="w")

    assert meta.pages == 412


def test_page_count_is_absent_when_not_declared(tmp_path: Path) -> None:
    """Never estimated: a file that does not say gets no answer. This is also
    the common real-world case — schema:numberOfPages is rare."""
    assert read_metadata(build_epub(tmp_path / "np.epub"), fallback_title="np").pages is None


@pytest.mark.parametrize(
    "pages",
    ["four hundred", "412.0", "-1", "0", "", "   ", "²", "٤٥٠", "1234567"],
)
def test_rejects_unusable_page_counts(tmp_path: Path, pages: str) -> None:
    """`²` is str.isdigit() but int() rejects it; `٤٥٠` int()s to 450. Only an
    explicit [0-9] match is both crash-free and honest about what it takes."""
    assert (
        read_metadata(build_epub(tmp_path / "b.epub", pages=pages), fallback_title="b").pages
        is None
    )


def test_ignores_refined_page_counts(tmp_path: Path) -> None:
    """`refines` scopes the statement to a component, not the book."""
    path = build_epub(
        tmp_path / "refined.epub",
        pages="412",
        extra_meta=['<meta refines="#part1" property="schema:numberOfPages">99</meta>'],
    )

    assert read_metadata(path, fallback_title="r").pages == 412


def test_a_refined_count_alone_is_not_the_books_page_count(tmp_path: Path) -> None:
    path = build_epub(
        tmp_path / "only-refined.epub",
        extra_meta=['<meta refines="#part1" property="schema:numberOfPages">99</meta>'],
    )

    assert read_metadata(path, fallback_title="r").pages is None


def test_survives_epub2_style_meta_elements(tmp_path: Path) -> None:
    """`<meta name=... content=.../>` has no `property` and no text, and sits
    alongside EPUB 3 `<meta>` in most Calibre output. Reading `property`
    without guarding for None is a 500 on upload of a very ordinary book."""
    path = build_epub(
        tmp_path / "calibre.epub",
        extra_meta=[
            '<meta name="calibre:series" content="Dune"/>',
            '<meta property="dcterms:modified">2026-07-01T00:00:00Z</meta>',
        ],
    )

    assert read_metadata(path, fallback_title="c").pages is None


def test_blurb_is_absent_when_undescribed(tmp_path: Path) -> None:
    meta = read_metadata(build_epub(tmp_path / "nb.epub", description=None), fallback_title="nb")

    assert meta.blurb is None


def test_joins_multiple_creators(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "co.epub", creators=["Neil Gaiman", "Terry Pratchett"])
    meta = read_metadata(path, fallback_title="ignored")

    assert meta.author == "Neil Gaiman, Terry Pratchett"
    assert meta.extra["authors"] == ["Neil Gaiman", "Terry Pratchett"]


def test_falls_back_when_metadata_is_missing(tmp_path: Path) -> None:
    """An untagged book is still importable — just with placeholder values."""
    path = build_epub(
        tmp_path / "bare.epub",
        titles=[],
        creators=[],
        language=None,
        publisher=None,
        published=None,
        description=None,
        identifiers=[],
        subjects=[],
    )
    meta = read_metadata(path, fallback_title="bare")

    assert meta.title == "bare"
    assert meta.author == "Unknown"
    assert meta.extra == {}


def test_honours_opf_location_from_container(tmp_path: Path) -> None:
    """The OPF path is whatever container.xml says, not a hardcoded guess."""
    path = build_epub(tmp_path / "odd.epub", opf_path="somewhere/else/package.opf")
    assert read_metadata(path, fallback_title="ignored").title == "Dune"


def test_rejects_non_zip(tmp_path: Path) -> None:
    path = tmp_path / "fake.epub"
    path.write_bytes(b"this is plainly not a zip archive")

    with pytest.raises(InvalidEpubError, match="not a zip archive"):
        read_metadata(path, fallback_title="fake")


def test_rejects_wrong_mimetype(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "wrong.epub", mimetype="application/zip")

    with pytest.raises(InvalidEpubError, match="unexpected mimetype"):
        read_metadata(path, fallback_title="wrong")


def test_tolerates_absent_mimetype(tmp_path: Path) -> None:
    """A missing mimetype member is sloppy but common; a wrong one is not."""
    path = build_epub(tmp_path / "nomime.epub", mimetype=None)
    assert read_metadata(path, fallback_title="nomime").title == "Dune"


def test_rejects_missing_container(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "nocontainer.epub", include_container=False)

    with pytest.raises(InvalidEpubError, match="META-INF/container.xml"):
        read_metadata(path, fallback_title="nocontainer")


def test_rejects_container_pointing_at_absent_opf(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "noopf.epub", include_opf=False)

    with pytest.raises(InvalidEpubError, match="missing required member"):
        read_metadata(path, fallback_title="noopf")


def test_rejects_malformed_opf_xml(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "broken.epub", opf_body="<package><metadata>")

    with pytest.raises(InvalidEpubError, match="not well-formed XML"):
        read_metadata(path, fallback_title="broken")


def test_rejects_opf_without_metadata_element(tmp_path: Path) -> None:
    path = build_epub(
        tmp_path / "nometa.epub",
        opf_body='<package xmlns="http://www.idpf.org/2007/opf"><manifest/></package>',
    )

    with pytest.raises(InvalidEpubError, match="no metadata element"):
        read_metadata(path, fallback_title="nometa")


def test_rejects_entity_declarations(tmp_path: Path) -> None:
    """Guards against billion-laughs style expansion in untrusted files."""
    bomb = (
        '<?xml version="1.0"?>\n'
        '<!DOCTYPE package [<!ENTITY lol "haha">]>\n'
        '<package xmlns="http://www.idpf.org/2007/opf"><metadata/></package>'
    )
    path = build_epub(tmp_path / "bomb.epub", opf_body=bomb)

    with pytest.raises(InvalidEpubError, match="doctype or entity"):
        read_metadata(path, fallback_title="bomb")
