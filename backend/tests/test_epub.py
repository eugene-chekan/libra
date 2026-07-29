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
