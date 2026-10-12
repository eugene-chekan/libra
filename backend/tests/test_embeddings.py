"""The real embedding model: a 0.21 GB download, so it runs only with LIBRA_TEST_MODELS=1."""

import os

import pytest

from app.config import Settings
from rag.chunking import MAX_TOKENS
from rag.embeddings import load_model

pytestmark = pytest.mark.skipif(
    os.environ.get("LIBRA_TEST_MODELS") != "1", reason="set LIBRA_TEST_MODELS=1 to load the model"
)


def test_the_count_includes_the_two_special_tokens() -> None:
    assert load_model(Settings()).token_count("hello world") == 4


def test_the_count_reaches_past_the_chunk_limit() -> None:
    model = load_model(Settings())

    assert model.token_count("word " * (MAX_TOKENS + 10)) > MAX_TOKENS
