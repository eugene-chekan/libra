"""BM25, dense search and RRF over the chunk tables."""

import numpy as np
import pytest
from sqlmodel import Session

from app.config import Settings
from app.models import Chunk, ChunkVector
from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusError
from rag.embeddings import embed_passages, embed_query, vector_bytes
from rag.search import DEPTH, METHODS, RRF_K, VectorIndex, bm25, fts_query, rrf, search
from tests.fake_embedder import FakeEmbedder


def add_chunks(
    session: Session,
    texts: list[str],
    version: int = CHUNKER_VERSION,
    model: str = "m",
    book_id: int = 1,
) -> list[int]:
    """Store chunks of one book, with their fake vectors; return their ids."""
    rows = [
        Chunk(
            book_id=book_id,
            position=position,
            spine_index=0,
            text=text,
            word_count=len(text.split()),
            token_count=len(text.split()),
            chunker_version=version,
        )
        for position, text in enumerate(texts)
    ]
    session.add_all(rows)
    session.flush()
    vectors = embed_passages(FakeEmbedder(), texts)
    session.add_all(
        ChunkVector(chunk_id=row.id, model=model, vector=vector_bytes(vector))
        for row, vector in zip(rows, vectors, strict=True)
    )
    session.commit()
    return [row.id for row in rows]


def test_fts_query_quotes_each_word_and_joins_with_or() -> None:
    assert fts_query("Why did the ships sail?") == '"Why" OR "did" OR "the" OR "ships" OR "sail"'


def test_operators_and_syntax_are_searched_as_words(session: Session) -> None:
    captain, _, not_near, and_title = add_chunks(
        session, ["the captain watched the sea", "a quiet harbour", "not near", "and title"]
    )

    found = bm25(session, 'Why did NOT the "captain" NEAR* title:sea AND (')

    assert set(found) == {captain, not_near, and_title}


def test_bm25_matches_a_stem(session: Session) -> None:
    sailed, _ = add_chunks(session, ["the ships sailed", "a quiet harbour"])

    assert bm25(session, "ship") == [sailed]


def test_bm25_ranks_the_best_match_first(session: Session) -> None:
    one, both, longer_one, _ = add_chunks(
        session, ["whale here", "whale and ship together", "a ship alone", "nothing"]
    )

    assert bm25(session, "whale ship") == [both, one, longer_one]


def test_bm25_breaks_ties_by_the_lower_id(session: Session) -> None:
    first, second = add_chunks(session, ["the ship", "the ship"])

    assert bm25(session, "ship") == [first, second]


def test_a_question_without_words_gives_no_bm25_ranking(session: Session) -> None:
    add_chunks(session, ["the ships sailed"])

    assert fts_query("?!") is None
    assert bm25(session, "?!") == []


def test_a_question_without_words_still_gets_the_dense_ranking(
    session: Session,
) -> None:
    add_chunks(session, ["the ships sailed", "a quiet harbour"])
    vectors = VectorIndex.load(session, "m")
    model = FakeEmbedder()

    fused = search(session, vectors, model, "?!", "bm25+dense")

    assert fused == vectors.top(embed_query(model, "?!"))


def test_dense_scores_every_vector_and_breaks_ties_by_id() -> None:
    vectors = VectorIndex(
        ids=np.array([3, 1, 2], dtype=np.int64),
        matrix=np.array([[1.0, 0.0], [0.6, 0.8], [1.0, 0.0]], dtype=np.float32),
    )
    query = np.array([1.0, 0.0], dtype=np.float32)

    assert vectors.top(query) == [2, 3, 1]
    assert vectors.top(query, depth=2) == [2, 3]


def test_rrf_by_hand() -> None:
    # 1: 1/61 + 1/62; 3: 1/63 + 1/61; 2: 1/62.
    assert rrf([[1, 2, 3], [3, 1]]) == [1, 3, 2]


def test_rrf_uses_its_constant() -> None:
    rankings = [[1, 5, 3], [2, 6, 3]]

    # With k = 0, a first place (1/1) beats two third places (1/3 + 1/3).
    assert rrf(rankings, k=0) == [1, 2, 3, 5, 6]
    # With k = 60, two third places (2/63) beat a first place (1/61).
    assert rrf(rankings, k=RRF_K) == [3, 1, 2, 5, 6]


def test_rrf_counts_only_the_top_depth() -> None:
    # Past depth 1, chunk 2 counts for nothing; counted, it would win with 2/62.
    assert rrf([[1, 2], [3, 2]], depth=1) == [1, 3]


def test_rrf_with_an_empty_list_keeps_the_other_ranking() -> None:
    assert rrf([[], [4, 5]]) == [4, 5]


def test_every_method_returns_at_most_depth_chunks(session: Session) -> None:
    add_chunks(session, [f"ship number {i}" for i in range(5)])
    vectors = VectorIndex.load(session, "m")

    for method in METHODS:
        found = search(session, vectors, FakeEmbedder(), "ship", method, depth=3)
        assert len(found) == 3, method


def test_the_fused_method_is_rrf_of_bm25_and_dense(session: Session) -> None:
    add_chunks(session, ["the ship", "a ship and a whale", "whale song", "quiet"])
    vectors = VectorIndex.load(session, "m")
    model = FakeEmbedder()

    fused = search(session, vectors, model, "ship whale", "bm25+dense")

    lists = [bm25(session, "ship whale"), vectors.top(embed_query(model, "ship whale"))]
    assert fused == rrf(lists)[:DEPTH]
    assert set(fused) == {chunk_id for ranking in lists for chunk_id in ranking}


def test_chunks_of_another_chunker_version_are_never_found(session: Session) -> None:
    current = add_chunks(session, ["the ship sailed"])
    add_chunks(session, ["the ship sailed"], version=CHUNKER_VERSION + 1)
    vectors = VectorIndex.load(session, "m")

    assert bm25(session, "ship") == current
    assert vectors.ids.tolist() == current


def test_an_empty_index_is_refused(session: Session, settings: Settings) -> None:
    with pytest.raises(CorpusError, match="rag index"):
        VectorIndex.load(session, settings.embedding_model)


def test_search_rejects_an_unknown_method(session: Session) -> None:
    add_chunks(session, ["the ship"])
    vectors = VectorIndex.load(session, "m")

    with pytest.raises(ValueError, match="magic"):
        search(session, vectors, FakeEmbedder(), "ship", "magic")


def test_a_partly_covered_index_is_refused(session: Session) -> None:
    add_chunks(session, ["the ship", "a whale"], model="m")
    add_chunks(session, ["a harbour"], model="another", book_id=2)

    with pytest.raises(CorpusError, match="m"):
        VectorIndex.load(session, "m")
