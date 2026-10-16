"""Small corpus books and lists for the `rag` tests."""

import csv
import hashlib
from pathlib import Path

from rag.corpus import CSV_FIELDS
from tests.epub_factory import Chapter, build_epub


def words_as_tokens(text: str) -> int:
    return len(text.split())


def make_book(folder: Path, name: str, words: int) -> Path:
    body = "<p>" + " ".join(f"w{i}" for i in range(words)) + "</p>"
    return build_epub(folder / name, titles=[name], chapters=[Chapter("one.xhtml", body)])


def row(path: Path, genre: str = "fiction", role: str = "test") -> dict:
    return {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "title": path.stem,
        "author": "An Author",
        "genre": genre,
        "role": role,
        "link": "https://standardebooks.org/ebooks/an-author/a-book",
    }


def write_csv(path: Path, rows: list[dict], *, bom: bool = False) -> Path:
    with path.open("w", encoding="utf-8-sig" if bom else "utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    return path
