"""The search methods the experiment compares, over the chunks of the current chunker version."""

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Self

import numpy as np
from sqlalchemy import func, text
from sqlmodel import Session, select

from app.models import Chunk, ChunkVector, Descriptor
from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusError
from rag.embeddings import Embedder, embed_query, vector_from_bytes

# Each method ranks this many chunks; RRF reads this many from each list.
DEPTH = 100
RRF_K = 60
# The methods that read the question's text only, and those that also read its descriptors.
TEXT_METHODS = ("bm25", "dense", "bm25+dense")
DESCRIPTOR_METHODS = ("descriptors", "dense+descriptors", "all")
METHODS = TEXT_METHODS + DESCRIPTOR_METHODS

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


@dataclass(frozen=True)
class DescriptorIndex:
    """Every descriptor vector of one prompt version and model in memory, grouped by chunk.

    `matrix` holds the rows in chunk id order, then descriptor order; `starts[i]` is the
    first row of the chunk `chunk_ids[i]`. A chunk with no descriptors is not in it.
    """

    chunk_ids: np.ndarray
    starts: np.ndarray
    matrix: np.ndarray

    @classmethod
    def load(cls, session: Session, prompt_version: str, model_name: str) -> Self:
        """Read the descriptor vectors of the current chunker version.

        Raises:
            CorpusError: There are none for this prompt version and model.
        """
        rows = session.exec(
            select(Descriptor.chunk_id, Descriptor.vector)
            .join(Chunk, Chunk.id == Descriptor.chunk_id)
            .where(
                Descriptor.prompt_version == prompt_version,
                Descriptor.model == model_name,
                Chunk.chunker_version == CHUNKER_VERSION,
            )
            .order_by(Descriptor.chunk_id, Descriptor.position)
        ).all()
        if not rows:
            raise CorpusError(
                f"no descriptors of prompt {prompt_version} embedded by {model_name}; "
                "run rag import-descriptors first"
            )
        ids = np.array([chunk_id for chunk_id, _ in rows], dtype=np.int64)
        starts = np.flatnonzero(np.r_[True, ids[1:] != ids[:-1]])
        return cls(
            chunk_ids=ids[starts],
            starts=starts,
            matrix=np.stack([vector_from_bytes(vector) for _, vector in rows]),
        )

    def top(self, queries: np.ndarray, depth: int = DEPTH) -> list[int]:
        """Chunk ids by MaxSim with unit query vectors, best first, ties to the lower id.

        For each query vector, its best cosine among a chunk's descriptors; the chunk scores
        the mean of those best values. No query vectors give no ranking.
        """
        if len(queries) == 0:
            return []
        best = np.maximum.reduceat(self.matrix @ queries.T, self.starts, axis=0)
        scores = best.mean(axis=1)
        order = np.lexsort((self.chunk_ids, -scores))
        return [int(chunk_id) for chunk_id in self.chunk_ids[order[:depth]]]


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
    descriptors: DescriptorIndex | None = None,
    query_descriptors: np.ndarray | None = None,
) -> list[int]:
    """The first `depth` chunk ids one method ranks for a question.

    Args:
        session: Open session on the indexed experiment database.
        vectors: From `VectorIndex.load`.
        model: The embedding model.
        question: The question's text.
        method: One of METHODS.
        depth: How many chunk ids to return.
        descriptors: From `DescriptorIndex.load`; needed by DESCRIPTOR_METHODS.
        query_descriptors: The question's descriptor vectors, no prefix, one per row; may
            have no rows. Needed by DESCRIPTOR_METHODS.

    Raises:
        ValueError: The method is not one of METHODS, or a descriptor method lacks
            `descriptors` or `query_descriptors`.
    """
    if method not in METHODS:
        raise ValueError(f"unknown method {method!r}; the methods are {', '.join(METHODS)}")
    if method == "bm25":
        return bm25(session, question, depth)
    dense = vectors.top(embed_query(model, question), depth)
    if method == "dense":
        return dense
    if method == "bm25+dense":
        return rrf([bm25(session, question, depth), dense], depth=depth)[:depth]
    if descriptors is None or query_descriptors is None:
        raise ValueError(f"{method} needs the descriptor index and the question's descriptors")
    matched = descriptors.top(query_descriptors, depth)
    if method == "descriptors":
        return matched
    if method == "dense+descriptors":
        return rrf([dense, matched], depth=depth)[:depth]
    return rrf([bm25(session, question, depth), dense, matched], depth=depth)[:depth]
