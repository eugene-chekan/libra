"""The real embedding model: a 0.21 GB download, so it runs only with LIBRA_TEST_MODELS=1."""

import os

import numpy as np
import pytest

from app.config import Settings
from rag.chunking import MAX_TOKENS
from rag.embeddings import embed_passages, embed_query, load_model

pytestmark = pytest.mark.skipif(
    os.environ.get("LIBRA_TEST_MODELS") != "1", reason="set LIBRA_TEST_MODELS=1 to load the model"
)


def test_the_count_includes_the_two_special_tokens() -> None:
    assert load_model(Settings()).token_count("hello world") == 4


def test_the_count_reaches_past_the_chunk_limit() -> None:
    model = load_model(Settings())

    assert model.token_count("word " * (MAX_TOKENS + 10)) > MAX_TOKENS


def test_the_real_model_embeds_768_unit_vectors() -> None:
    model = load_model(Settings())

    passages = embed_passages(model, ["The ship stops for water.", "A quiet harbour."])
    query = embed_query(model, "Where does the ship stop?")

    assert passages.shape == (2, 768)
    assert passages.dtype == np.float32
    assert np.linalg.norm(passages, axis=1) == pytest.approx([1.0, 1.0], abs=1e-5)
    assert query.shape == (768,)
    assert float(passages[0] @ query) > float(passages[1] @ query)
