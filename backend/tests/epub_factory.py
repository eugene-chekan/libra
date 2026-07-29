"""Builds minimal but spec-valid EPUB files for tests.

Generating them here rather than committing binary fixtures keeps the
malformed variants (bad mimetype, missing container, no metadata) readable and
easy to extend — each one is a keyword argument away from the happy path.
"""

import zipfile
from pathlib import Path

CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="{opf_path}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
{metadata}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine/>
</package>
"""


def _metadata_block(
    titles: list[str],
    creators: list[str],
    language: str | None,
    publisher: str | None,
    published: str | None,
    description: str | None,
    identifiers: list[str],
    subjects: list[str],
) -> str:
    lines: list[str] = []
    lines += [f"    <dc:title>{value}</dc:title>" for value in titles]
    lines += [f"    <dc:creator>{value}</dc:creator>" for value in creators]
    if language:
        lines.append(f"    <dc:language>{language}</dc:language>")
    if publisher:
        lines.append(f"    <dc:publisher>{publisher}</dc:publisher>")
    if published:
        lines.append(f"    <dc:date>{published}</dc:date>")
    if description:
        lines.append(f"    <dc:description>{description}</dc:description>")
    lines += [f'    <dc:identifier id="bookid">{v}</dc:identifier>' for v in identifiers]
    lines += [f"    <dc:subject>{value}</dc:subject>" for value in subjects]
    return "\n".join(lines)


def build_epub(
    path: Path,
    *,
    titles: list[str] | None = None,
    creators: list[str] | None = None,
    language: str | None = "en",
    publisher: str | None = "Ace Books",
    published: str | None = "1965-08-01",
    description: str | None = "Desert planet politics.",
    identifiers: list[str] | None = None,
    subjects: list[str] | None = None,
    opf_path: str = "OEBPS/content.opf",
    mimetype: str | None = "application/epub+zip",
    include_container: bool = True,
    include_opf: bool = True,
    opf_body: str | None = None,
) -> Path:
    """Write an EPUB to `path`. Defaults produce a valid, fully tagged book."""
    titles = ["Dune"] if titles is None else titles
    creators = ["Frank Herbert"] if creators is None else creators
    identifiers = ["urn:isbn:9780441013593"] if identifiers is None else identifiers
    subjects = ["Science Fiction"] if subjects is None else subjects

    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        if mimetype is not None:
            # Real EPUBs store this first and uncompressed; mirror that so the
            # fixtures stay faithful to what readers actually emit.
            archive.writestr(
                zipfile.ZipInfo("mimetype"), mimetype, compress_type=zipfile.ZIP_STORED
            )
        if include_container:
            archive.writestr("META-INF/container.xml", CONTAINER_XML.format(opf_path=opf_path))
        if include_opf:
            body = (
                opf_body
                if opf_body is not None
                else OPF_TEMPLATE.format(
                    metadata=_metadata_block(
                        titles,
                        creators,
                        language,
                        publisher,
                        published,
                        description,
                        identifiers,
                        subjects,
                    )
                )
            )
            archive.writestr(opf_path, body)
        archive.writestr("OEBPS/nav.xhtml", "<html><body><nav/></body></html>")
    return path


def epub_bytes(tmp_path: Path, name: str = "book.epub", **kwargs) -> bytes:
    """Convenience wrapper returning the raw bytes, for upload requests."""
    return build_epub(tmp_path / name, **kwargs).read_bytes()
