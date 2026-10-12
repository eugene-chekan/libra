"""Reading the spine: the order the chunker walks, confined to the archive."""

from pathlib import Path

import pytest

from app.epub import MAX_XML_BYTES, XHTML_NS, InvalidEpubError, read_chapter, read_spine
from tests.epub_factory import OPF_TEMPLATE, Chapter, build_epub

P = f"{{{XHTML_NS}}}p"


def test_the_spine_lists_chapters_in_reading_order(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "b.epub", chapters=[Chapter("one.xhtml"), Chapter("two.xhtml")])

    spine = read_spine(path)

    assert [item.href for item in spine] == ["OEBPS/text/one.xhtml", "OEBPS/text/two.xhtml"]
    assert {item.media_type for item in spine} == {"application/xhtml+xml"}


def test_titles_come_from_the_nav(tmp_path: Path) -> None:
    path = build_epub(
        tmp_path / "b.epub",
        chapters=[Chapter("one.xhtml", title="I: The Impulse of Spring"), Chapter("two.xhtml")],
    )

    assert [item.title for item in read_spine(path)] == ["I: The Impulse of Spring", None]


def test_the_first_nav_entry_for_a_file_wins(tmp_path: Path) -> None:
    path = build_epub(
        tmp_path / "b.epub",
        chapters=[Chapter("one.xhtml", title="I")],
        nav_extra=['<li><a href="text/one.xhtml#part-2">I, continued</a></li>'],
    )

    assert read_spine(path)[0].title == "I"


def test_an_escaped_href_names_the_real_member(tmp_path: Path) -> None:
    chapter = Chapter(
        "chapter 1.xhtml", body="<p>Hello</p>", href="text/chapter%201.xhtml", title="One"
    )
    path = build_epub(tmp_path / "b.epub", chapters=[chapter])

    [item] = read_spine(path)

    assert item.href == "OEBPS/text/chapter 1.xhtml"
    assert item.title == "One"
    assert read_chapter(path, item.href).find(f".//{P}").text == "Hello"


def test_the_nav_document_is_marked(tmp_path: Path) -> None:
    path = build_epub(tmp_path / "b.epub", chapters=[Chapter("one.xhtml")], nav_in_spine=True)

    assert [item.is_nav for item in read_spine(path)] == [True, False]


@pytest.mark.parametrize("href", ["../../evil.xhtml", "/etc/passwd", "file:///etc/passwd"])
def test_an_href_leaving_the_archive_is_refused(tmp_path: Path, href: str) -> None:
    path = build_epub(tmp_path / "b.epub", chapters=[Chapter("one.xhtml", href=href)])

    with pytest.raises(InvalidEpubError, match="leaves the archive"):
        read_spine(path)


def test_an_unknown_itemref_is_refused(tmp_path: Path) -> None:
    opf = OPF_TEMPLATE.format(
        metadata="    <dc:title>X</dc:title>", manifest_extra="", spine='<itemref idref="ghost"/>'
    )
    path = build_epub(tmp_path / "b.epub", opf_body=opf)

    with pytest.raises(InvalidEpubError, match="ghost"):
        read_spine(path)


def test_a_chapter_with_a_doctype_is_refused(tmp_path: Path) -> None:
    raw = '<?xml version="1.0"?><!DOCTYPE html [<!ENTITY boom "x">]><html/>'
    path = build_epub(tmp_path / "b.epub", chapters=[Chapter("one.xhtml", raw=raw)])
    [item] = read_spine(path)

    with pytest.raises(InvalidEpubError, match="doctype"):
        read_chapter(path, item.href)


def test_an_oversized_chapter_is_refused(tmp_path: Path) -> None:
    raw = "<html>" + "a" * (MAX_XML_BYTES + 1) + "</html>"
    path = build_epub(tmp_path / "b.epub", chapters=[Chapter("one.xhtml", raw=raw)])
    [item] = read_spine(path)

    with pytest.raises(InvalidEpubError, match="large|exceeds"):
        read_chapter(path, item.href)


@pytest.mark.parametrize("href", ["../outside.xhtml", "/OEBPS/text/one.xhtml"])
def test_read_chapter_refuses_a_path_outside_the_archive(tmp_path: Path, href: str) -> None:
    path = build_epub(tmp_path / "b.epub", chapters=[Chapter("one.xhtml")])

    with pytest.raises(InvalidEpubError, match="leaves the archive"):
        read_chapter(path, href)


def test_a_file_that_is_not_a_zip_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "b.epub"
    path.write_bytes(b"not a zip")

    with pytest.raises(InvalidEpubError):
        read_spine(path)
