"""EPUB structure validation and metadata extraction."""

import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

CONTAINER_PATH = "META-INF/container.xml"
MIMETYPE_PATH = "mimetype"
EPUB_MIMETYPE = "application/epub+zip"

NS = {
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}

# No legitimate container.xml or OPF is anywhere near this large. Capping the
# read guards against a compressed member that expands to something huge.
MAX_XML_BYTES = 2 * 1024 * 1024

# OPF 2 distinguishes several dc:date elements with this attribute. Unlike the
# `schema:` prefix below, this one is a genuine namespaced attribute name, so
# it resolves through NS.
DATE_EVENT_ATTR = f"{{{NS['opf']}}}event"

# These describe the file, not the edition: a 1965 novel re-exported last week
# is not a 2026 book.
IGNORED_DATE_EVENTS = frozenset({"creation", "modification"})
DATE_EVENT_RANK = {"publication": 0, "original-publication": 1, "": 2}

# dc:date is W3C-DTF, so the year is the leading four-digit run. The negative
# lookahead refuses "20110101", which is a malformed date rather than 2011.
_ISO_YEAR = re.compile(r"^\s*(\d{4})(?!\d)")
# Non-conformant free text happens ("August 1965", "01/08/1965"). An isolated
# four-digit run is still a year; nothing beyond that is guessed at.
_LOOSE_YEAR = re.compile(r"(?<!\d)(\d{4})(?!\d)")

# Nothing was printed before movable type, and Calibre writes 0101-01-01 as its
# "date unknown" sentinel. Both fall outside this floor.
MIN_PLAUSIBLE_YEAR = 1450

# EPUB 3 reserves the `schema` prefix for schema.org, so a declared page count
# is spelled exactly this way. It is a prefix inside an attribute *value*, not
# an XML namespace — ElementTree resolves prefixes on names only, so NS cannot
# help and the comparison is against this literal string.
NUMBER_OF_PAGES = "schema:numberOfPages"

# Explicitly [0-9] rather than \d or str.isdigit(): int("٤٥٠") happily returns
# 450, and "²".isdigit() is True while int("²") raises. Only the ASCII spelling
# is both crash-free and honest about what it accepts.
_PAGE_COUNT = re.compile(r"[0-9]{1,6}")


class InvalidEpubError(ValueError):
    """Raised when a file is not a usable EPUB."""


@dataclass
class EpubMetadata:
    """Metadata recovered from an EPUB, with fallbacks already applied."""

    title: str
    author: str
    year: int | None = None
    blurb: str | None = None
    pages: int | None = None
    # Path to the cover *within the archive*, already resolved against the
    # OPF's directory, plus the media type the manifest declares. Both None
    # when the file declares no cover, which is a normal and common state.
    cover_href: str | None = None
    cover_media_type: str | None = None
    extra: dict = field(default_factory=dict)


def _read_member(archive: zipfile.ZipFile, name: str) -> bytes:
    """Read a zip member, refusing ones that claim an implausible size."""
    try:
        info = archive.getinfo(name)
    except KeyError as exc:
        raise InvalidEpubError(f"missing required member: {name}") from exc

    if info.file_size > MAX_XML_BYTES:
        raise InvalidEpubError(f"{name} is implausibly large ({info.file_size} bytes)")

    with archive.open(info) as handle:
        # Read one byte past the cap so a lying header (file_size understating
        # the real content) still trips the check rather than being trusted.
        data = handle.read(MAX_XML_BYTES + 1)

    if len(data) > MAX_XML_BYTES:
        raise InvalidEpubError(f"{name} exceeds {MAX_XML_BYTES} bytes")
    return data


def _parse_xml(data: bytes, what: str) -> ET.Element:
    """Parse XML from an untrusted archive."""
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise InvalidEpubError(f"{what} contains a doctype or entity declaration")

    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise InvalidEpubError(f"{what} is not well-formed XML: {exc}") from exc


def _opf_path(archive: zipfile.ZipFile) -> str:
    """Resolve the OPF package document's path via META-INF/container.xml."""
    root = _parse_xml(_read_member(archive, CONTAINER_PATH), CONTAINER_PATH)
    rootfile = root.find("container:rootfiles/container:rootfile", NS)
    if rootfile is None:
        raise InvalidEpubError("container.xml declares no rootfile")

    full_path = rootfile.get("full-path")
    if not full_path:
        raise InvalidEpubError("container.xml rootfile has no full-path")
    return full_path


def _dc_values(metadata: ET.Element, tag: str) -> list[str]:
    """Collect non-empty Dublin Core values for a tag, in document order."""
    return [
        el.text.strip() for el in metadata.findall(f"dc:{tag}", NS) if el.text and el.text.strip()
    ]


def _publication_date(metadata: ET.Element) -> str | None:
    """Pick the `dc:date` describing the edition, as its raw string."""
    candidates: list[tuple[int, str]] = []
    for el in metadata.findall("dc:date", NS):
        if not (el.text and el.text.strip()):
            continue
        event = (el.get(DATE_EVENT_ATTR) or "").strip().lower()
        if event in IGNORED_DATE_EVENTS:
            continue
        candidates.append((DATE_EVENT_RANK.get(event, 3), el.text.strip()))

    if not candidates:
        return None
    # min() is stable, so equal ranks keep document order.
    return min(candidates, key=lambda candidate: candidate[0])[1]


def _parse_year(value: str) -> int | None:
    """Turn a `dc:date` string into a year, or None if it does not yield one."""
    match = _ISO_YEAR.match(value) or _LOOSE_YEAR.search(value)
    if match is None:
        return None

    year = int(match.group(1))
    if not MIN_PLAUSIBLE_YEAR <= year <= datetime.now(tz=UTC).year + 1:
        return None
    return year


def _declared_pages(metadata: ET.Element) -> int | None:
    """Read the print page count the file declares, or None."""
    for el in metadata.findall("opf:meta", NS):
        # `property` is absent on EPUB 2 `<meta name=... content=.../>`, which
        # coexists with EPUB 3 `<meta>` in most Calibre output. Calling
        # .strip() on that None is an AttributeError, i.e. a 500 on upload of
        # a very ordinary book.
        if (el.get("property") or "").strip() != NUMBER_OF_PAGES:
            continue
        # `refines` scopes the statement to another element — a chapter or a
        # collection — so only the unrefined one describes the book itself.
        if el.get("refines"):
            continue

        text = (el.text or "").strip()
        if _PAGE_COUNT.fullmatch(text) and int(text) > 0:
            return int(text)
    return None


def _verify_mimetype(archive: zipfile.ZipFile) -> None:
    # The mimetype member is required by the spec but some real-world files
    # produced by sloppy tooling omit it. Treat a *wrong* value as fatal and a
    # missing one as tolerable, so we stay strict about actual mismatches
    # without rejecting books that otherwise parse fine.
    try:
        declared = _read_member(archive, MIMETYPE_PATH).decode("ascii", "replace").strip()
    except InvalidEpubError:
        return
    if declared != EPUB_MIMETYPE:
        raise InvalidEpubError(f"unexpected mimetype: {declared!r}")


def _cover_href(opf_root: ET.Element, metadata: ET.Element) -> tuple[str, str] | None:
    """Find the cover image's path within the archive, and its media type."""
    manifest = opf_root.find("opf:manifest", NS)
    if manifest is None:
        return None

    items = manifest.findall("opf:item", NS)

    # EPUB 3 first: an explicit declaration beats an indirect one.
    for item in items:
        properties = (item.get("properties") or "").split()
        if "cover-image" in properties:
            href, media_type = item.get("href"), item.get("media-type")
            if href and media_type:
                return href, media_type

    # EPUB 2: a <meta> naming a manifest item by id. `.get("name")` rather
    # than assuming it exists — EPUB 3 <meta property=...> elements have no
    # `name` at all and sit in the same <metadata>.
    cover_id = None
    for meta in metadata.findall("opf:meta", NS):
        if (meta.get("name") or "").strip().lower() == "cover":
            cover_id = (meta.get("content") or "").strip()
            break

    if cover_id:
        for item in items:
            if item.get("id") == cover_id:
                href, media_type = item.get("href"), item.get("media-type")
                if href and media_type:
                    return href, media_type
    return None


def read_cover(path: Path, archive_href: str, max_bytes: int) -> bytes:
    """Read a cover image out of the EPUB.

    Args:
        path: The EPUB on disk.
        archive_href: Member name inside the archive, as the manifest gave it.
        max_bytes: Ceiling on the decompressed member.

    Raises:
        InvalidEpubError: Not a readable archive, or the member is missing or
            oversized.
    """
    with zipfile.ZipFile(path) as archive:
        try:
            info = archive.getinfo(archive_href)
        except KeyError as exc:
            raise InvalidEpubError(f"cover member is missing: {archive_href}") from exc

        if info.file_size > max_bytes:
            raise InvalidEpubError(f"cover is implausibly large ({info.file_size} bytes)")

        with archive.open(info) as handle:
            data = handle.read(max_bytes + 1)

    if len(data) > max_bytes:
        raise InvalidEpubError(f"cover exceeds {max_bytes} bytes")
    return data


def read_metadata(path: Path, fallback_title: str) -> EpubMetadata:
    """Validate `path` as an EPUB and extract its metadata.

    Args:
        path: The EPUB on disk.
        fallback_title: Used when the file declares no title.

    Raises:
        InvalidEpubError: Structurally unusable — bad zip, missing container or
            OPF, or a declaration this parser refuses.
    """
    if not zipfile.is_zipfile(path):
        raise InvalidEpubError("file is not a zip archive")

    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise InvalidEpubError("archive contains a corrupt member")

        _verify_mimetype(archive)

        opf_path = _opf_path(archive)
        opf_root = _parse_xml(_read_member(archive, opf_path), opf_path)

        metadata = opf_root.find("opf:metadata", NS)
        if metadata is None:
            raise InvalidEpubError("OPF has no metadata element")

        titles = _dc_values(metadata, "title")
        creators = _dc_values(metadata, "creator")

        extra: dict = {}
        for tag, key in (
            ("language", "language"),
            ("publisher", "publisher"),
            ("identifier", "identifiers"),
            ("subject", "subjects"),
        ):
            values = _dc_values(metadata, tag)
            if not values:
                continue
            # Fields that are genuinely list-like keep every value; the rest
            # collapse to the first, which is the one readers display.
            extra[key] = values if key in {"identifiers", "subjects"} else values[0]

        if len(creators) > 1:
            extra["authors"] = creators

        # `date` and `description` have left this loop: the first is now chosen
        # by rank rather than document order, and the second is a column. The
        # raw date string still goes in the blob even when it parses cleanly,
        # so a wrong `year` can always be traced to what the file actually said.
        published = _publication_date(metadata)
        if published is not None:
            extra["published"] = published

        descriptions = _dc_values(metadata, "description")

        cover_href = cover_media_type = None
        declared_cover = _cover_href(opf_root, metadata)
        if declared_cover is not None:
            href, cover_media_type = declared_cover
            # The manifest href is relative to the OPF, not the zip root, and
            # the OPF is very often in a subdirectory. posixpath because zip
            # member names always use forward slashes regardless of platform.
            opf_dir = posixpath.dirname(opf_path)
            cover_href = posixpath.normpath(posixpath.join(opf_dir, href)) if opf_dir else href

        return EpubMetadata(
            title=titles[0] if titles else fallback_title,
            author=", ".join(creators) if creators else "Unknown",
            year=_parse_year(published) if published is not None else None,
            blurb=descriptions[0] if descriptions else None,
            pages=_declared_pages(metadata),
            cover_href=cover_href,
            cover_media_type=cover_media_type,
            extra=extra,
        )
