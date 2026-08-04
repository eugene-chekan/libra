"""EPUB structure validation and metadata extraction.

Parses metadata straight out of the EPUB's OPF package document using the
standard library. We deliberately do not shell out to Calibre's `ebook-meta`
here even though `ebook-convert` is the chosen tool for format conversion:
spawning a subprocess per upload is slower and would make the test suite
depend on Calibre being installed in CI, whereas the OPF is just XML at a
location the spec pins down.

Layout we rely on (EPUB 2 and 3 both guarantee it):

    mimetype                 -> "application/epub+zip"
    META-INF/container.xml   -> <rootfile full-path="..."> points at the OPF
    <the OPF>                -> <metadata> with Dublin Core elements
"""

import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
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


class InvalidEpubError(ValueError):
    """Raised when a file is not a usable EPUB."""


@dataclass
class EpubMetadata:
    """Metadata recovered from an EPUB, with fallbacks already applied."""

    title: str
    author: str
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
    """Parse XML from an untrusted archive.

    ElementTree expands internal DTD entities, which makes "billion laughs"
    style expansion a real concern for files we did not author. Neither
    container.xml nor the OPF uses a doctype in practice, so rejecting them
    outright closes that hole without pulling in a third-party parser.
    """
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


def read_metadata(path: Path, fallback_title: str) -> EpubMetadata:
    """Validate `path` as an EPUB and extract its metadata.

    Structural problems raise `InvalidEpubError`. Missing *metadata* does not:
    a book with no title element falls back to `fallback_title` and an unknown
    author to "Unknown", because real libraries are full of imperfectly
    tagged files and refusing them would make the tool useless.
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
            ("date", "published"),
            ("description", "description"),
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

        return EpubMetadata(
            title=titles[0] if titles else fallback_title,
            author=", ".join(creators) if creators else "Unknown",
            extra=extra,
        )
