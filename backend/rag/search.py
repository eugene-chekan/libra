"""The search methods the experiment compares, over the chunks of the current chunker version."""

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Self

import numpy as np
from sqlalchemy import func, text
from sqlmodel import Session, select

from app.models import Chunk, ChunkVector
from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusError
from rag.embeddings import Embedder, embed_query, vector_from_bytes

# Each method ranks this many chunks; RRF reads this many from each list.
DEPTH = 100
RRF_K = 60
METHODS = ("bm25", "dense", "bm25+dense")

_WORD = re.compile(r"\w+")
_BM25 = text(
    "SELECT chunk_fts.rowid FROM chunk_fts JOIN chunk ON chunk.id = chunk_fts.rowid"
    " WHERE chunk_fts MATCH :query AND chunk.chunker_version = :version"
    " ORDER BY bm25(chunk_fts), chunk_fts.rowid LIMIT :depth"
)


def fts_query(question: str) -> str | None:
    """The question as an FTS5 query: each word quoted, joined with OR; None without words.

    A word is letters, digits and `_`, so `*`, `:` and `"` drop out. Quoting makes `NOT`,
    `NEAR`, `AND` and `OR` plain words.
    """
    words = _WORD.findall(question)
    return " OR ".join(f'"{word}"' for word in words) if words else None


def bm25(session: Session, question: str, depth: int = DEPTH) -> list[int]:
    """Chunk ids by SQLite's BM25 (k1 = 1.2, b = 0.75), best first, ties to the lower id."""
    query = fts_query(question)
    if query is None:
        return []
    params = {"query": query, "version": CHUNKER_VERSION, "depth": depth}
    return list(session.connection().execute(_BM25, params).scalars())


@dataclass(frozen=True)
class VectorIndex:
    """Every chunk vector of one model in memory, for exact search."""

    ids: np.ndarray
    matrix: np.ndarray

    @classmethod
    def load(cls, session: Session, model_name: str) -> Self:
        """Read the vectors of `model_name` for the current chunker version.

        Raises:
            CorpusError: Some chunk of that version has no vector by that model, so a
                search would miss it.
        """
        rows = session.exec(
            select(ChunkVector.chunk_id, ChunkVector.vector)
            .join(Chunk, Chunk.id == ChunkVector.chunk_id)
            .where(ChunkVector.model == model_name, Chunk.chunker_version == CHUNKER_VERSION)
            .order_by(ChunkVector.chunk_id)
        ).all()
        chunks = session.exec(
            select(func.count()).select_from(Chunk).where(Chunk.chunker_version == CHUNKER_VERSION)
        ).one()
        if not rows or len(rows) != chunks:
            raise CorpusError(
                f"{len(rows)} of {chunks} chunks have vectors for {model_name}; "
                "run rag index with that model first"
            )
        return cls(
            ids=np.array([chunk_id for chunk_id, _ in rows], dtype=np.int64),
            matrix=np.stack([vector_from_bytes(vector) for _, vector in rows]),
        )

    def top(self, query: np.ndarray, depth: int = DEPTH) -> list[int]:
        """Chunk ids by cosine similarity to a unit query, best first, ties to the lower id."""
        scores = self.matrix @ query
        order = np.lexsort((self.ids, -scores))
        return [int(chunk_id) for chunk_id in self.ids[order[:depth]]]


def rrf(rankings: list[list[int]], k: int = RRF_K, depth: int = DEPTH) -> list[int]:
    """Reciprocal rank fusion: each chunk scores the sum of 1 / (k + rank) over the lists.

    Ranks start at 1, and only each list's first `depth` chunks count. Ties go to the lower id.
    """
    scores: dict[int, float] = defaultdict(float)
    for ranking in rankings:
        for rank, chunk_id in enumerate(ranking[:depth], start=1):
            scores[chunk_id] += 1 / (k + rank)
    return sorted(scores, key=lambda chunk_id: (-scores[chunk_id], chunk_id))


def search(
    session: Session,
    vectors: VectorIndex,
    model: Embedder,
    question: str,
    method: str,
    depth: int = DEPTH,
) -> list[int]:
    """The first `depth` chunk ids one method ranks for a question.

    Raises:
        ValueError: The method is not one of METHODS.
    """
    if method == "bm25":
        return bm25(session, question, depth)
    if method == "dense":
        return vectors.top(embed_query(model, question), depth)
    if method == "bm25+dense":
        dense = vectors.top(embed_query(model, question), depth)
        return rrf([bm25(session, question, depth), dense], depth=depth)[:depth]
    raise ValueError(f"unknown method {method!r}; the methods are {', '.join(METHODS)}")
