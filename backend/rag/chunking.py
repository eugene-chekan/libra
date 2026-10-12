"""Turn a book into the chunks the retrieval experiment searches."""

import hashlib
import re
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

from app.epub import EPUB_TYPE, XHTML_NS, read_chapter, read_spine

# Raised whenever the chunks made from the same file change. Every question label
# names the version it was made with, so a new version makes the labels invalid.
CHUNKER_VERSION = 1

TARGET_WORDS = 250
# Counted by the embedding model's own tokenizer, which stops at 512, so no chunk
# is cut short when it is embedded.
MAX_TOKENS = 450
# Questions are never drafted from a chunk this short.
SHORT_CHUNK_WORDS = 100

XHTML_MEDIA_TYPE = "application/xhtml+xml"

_X = f"{{{XHTML_NS}}}"
_BLOCKS = {_X + tag for tag in ("p", "li", "blockquote", "dd", "dt", "tr", "pre", "div")}
_HEADINGS = {_X + tag for tag in ("hgroup", "h1", "h2", "h3", "h4", "h5", "h6")}
_SKIPPED = _HEADINGS | {_X + tag for tag in ("header", "nav", "figure")}
_SPACED = {_X + tag for tag in ("br", "td", "th")}
_SKIPPED_TYPES = {"noteref", "title", "subtitle", "bridgehead"}
_SECTION_TYPES = {"frontmatter", "bodymatter", "backmatter"}
_SENTENCE_END = re.compile(r'[.!?…]["”’»)\]]*(?=\s)')


@dataclass(frozen=True)
class TextChunk:
    """One chunk of a book's body text."""

    # 0, 1, 2… across the whole book. With the book's sha256 and CHUNKER_VERSION,
    # this is the chunk's identity.
    position: int
    spine_index: int
    chapter_title: str | None
    text: str
    word_count: int
    token_count: int


def _types(element: ET.Element) -> set[str]:
    return set((element.get(EPUB_TYPE) or "").split())


def _text(element: ET.Element) -> str:
    """The element's text without note references, with a space where a line or cell breaks."""
    parts = [element.text or ""]
    for child in element:
        if "noteref" not in _types(child):
            if child.tag in _SPACED:
                parts.append(" ")
            parts.append(_text(child))
        parts.append(child.tail or "")
    return "".join(parts)


def _paragraphs(element: ET.Element) -> Iterator[str]:
    """Yield the text of every innermost block under `element`, in document order."""
    for child in element:
        if child.tag in _SKIPPED or _types(child) & _SKIPPED_TYPES:
            continue
        nested = any(node.tag in _BLOCKS for node in child.iter() if node is not child)
        if child.tag in _BLOCKS and not nested:
            text = " ".join(_text(child).split())
            if text:
                yield text
        else:
            yield from _paragraphs(child)


def _heading(body: ET.Element) -> str | None:
    """The first heading's text, for a chapter the nav does not name."""
    for element in body.iter():
        if element.tag in _HEADINGS:
            text = " ".join(_text(element).split())
            if text:
                return text
    return None


def _sentences(text: str) -> list[str]:
    pieces, start = [], 0
    for match in _SENTENCE_END.finditer(text):
        pieces.append(text[start : match.end()].strip())
        start = match.end()
    pieces.append(text[start:].strip())
    return [piece for piece in pieces if piece]


def _fit(parts: list[str], count_tokens: Callable[[str], int]) -> list[str]:
    """Join `parts` greedily into pieces of at most MAX_TOKENS tokens."""
    pieces: list[str] = []
    current: list[str] = []
    for part in parts:
        if current and count_tokens(" ".join([*current, part])) > MAX_TOKENS:
            pieces.append(" ".join(current))
            current = []
        current.append(part)
    if current:
        pieces.append(" ".join(current))
    return pieces


def _units(paragraph: str, count_tokens: Callable[[str], int]) -> list[str]:
    """The paragraph, or pieces of it cut at sentence ends that each fit the token limit."""
    if count_tokens(paragraph) <= MAX_TOKENS:
        return [paragraph]
    units = []
    for piece in _fit(_sentences(paragraph), count_tokens):
        fits = count_tokens(piece) <= MAX_TOKENS
        units += [piece] if fits else _fit(piece.split(), count_tokens)
    return units


def _pack(units: list[str], count_tokens: Callable[[str], int]) -> list[str]:
    """Group one chapter's units into chunk texts of TARGET_WORDS or more, within MAX_TOKENS."""
    chunks: list[str] = []
    current: list[str] = []
    words = 0
    for unit in units:
        too_big = count_tokens("\n\n".join([*current, unit])) > MAX_TOKENS
        if current and (words >= TARGET_WORDS or too_big):
            chunks.append("\n\n".join(current))
            current, words = [], 0
        current.append(unit)
        words += len(unit.split())
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def chunks_digest(chunks: list[TextChunk]) -> str:
    """A fingerprint of the chunk texts and boundaries: equal only if two runs chunked alike."""
    return hashlib.sha256("\0".join(chunk.text for chunk in chunks).encode()).hexdigest()


def chunk_book(path: Path, count_tokens: Callable[[str], int]) -> list[TextChunk]:
    """Chunk a book's body text chapter by chapter, with no overlap.

    Args:
        path: The EPUB on disk.
        count_tokens: The embedding model's token count for a text.

    Raises:
        InvalidEpubError: The file, or one of its chapters, is not usable.
    """
    bodies = [
        (index, item, read_chapter(path, item.href).find(f"{_X}body"))
        for index, item in enumerate(read_spine(path))
        if item.media_type == XHTML_MEDIA_TYPE and not item.is_nav
    ]
    labelled = any(body is not None and _types(body) & _SECTION_TYPES for _, _, body in bodies)

    chunks: list[TextChunk] = []
    for index, item, body in bodies:
        if body is None or (labelled and "bodymatter" not in _types(body)):
            continue
        title = item.title or _heading(body)
        units = [
            unit for paragraph in _paragraphs(body) for unit in _units(paragraph, count_tokens)
        ]
        for text in _pack(units, count_tokens):
            chunks.append(
                TextChunk(
                    position=len(chunks),
                    spine_index=index,
                    chapter_title=title,
                    text=text,
                    word_count=len(text.split()),
                    token_count=count_tokens(text),
                )
            )
    return chunks
