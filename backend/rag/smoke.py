"""A smoke test of the index: can each method find a chunk from its own first words?

It checks the plumbing, not the methods: a query copied from a chunk is far easier than a
question. Nothing it prints is an experiment result, and it writes nothing.
"""

import random

from sqlmodel import Session, select

from app.models import Chunk
from rag.chunking import CHUNKER_VERSION, SHORT_CHUNK_WORDS
from rag.corpus import CorpusError
from rag.embeddings import Embedder
from rag.metrics import K_VALUES, rank_of, recall_at
from rag.questions import HAND_SET_SIZE, HandRecord
from rag.search import METHODS, VectorIndex, search

SMOKE_SEED = "smoke-2026-10"
QUERY_WORDS = 12


def require_hand_set(records: list[HandRecord]) -> None:
    """Refuse to search before the hand questions are all written, so no result can steer them.

    Raises:
        CorpusError: Fewer than HAND_SET_SIZE questions are kept.
    """
    kept = sum(1 for record in records if record.status == "kept")
    if kept < HAND_SET_SIZE:
        raise CorpusError(
            f"{kept} of {HAND_SET_SIZE} hand questions are written; "
            "write the hand questions first, before any search runs"
        )


def smoke(
    session: Session,
    vectors: VectorIndex,
    model: Embedder,
    hand_records: list[HandRecord],
    sample: int = 30,
) -> dict[str, float]:
    """Recall at the largest k for each method, on the first words of random chunks.

    Args:
        session: Open session on the indexed experiment database.
        vectors: From `VectorIndex.load`.
        model: The embedding model.
        hand_records: From `read_records`; all hand questions must be written.
        sample: How many chunks of 100+ words to try.

    Returns:
        Recall for each method in METHODS.

    Raises:
        CorpusError: The hand set is not complete.
    """
    require_hand_set(hand_records)
    chunks = session.exec(
        select(Chunk)
        .where(Chunk.chunker_version == CHUNKER_VERSION, Chunk.word_count >= SHORT_CHUNK_WORDS)
        .order_by(Chunk.id)
    ).all()
    picked = random.Random(SMOKE_SEED).sample(list(chunks), min(sample, len(chunks)))
    k = max(K_VALUES)
    recall = {}
    for method in METHODS:
        ranks = [
            rank_of(
                search(session, vectors, model, " ".join(chunk.text.split()[:QUERY_WORDS]), method),
                chunk.id,
            )
            for chunk in picked
        ]
        recall[method] = recall_at(ranks, k)
    return recall
