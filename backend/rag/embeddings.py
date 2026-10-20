"""The embedding model the experiment uses, through fastembed."""

from typing import Protocol

import numpy as np
from fastembed import TextEmbedding

from app.config import Settings

# The model card's instruction for a question searching passages. fastembed adds
# no prefix for this model, so the code adds it; chunks and descriptors get none.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
# How every vector is stored: float32, little-endian.
_STORED = np.dtype("<f4")


class Embedder(Protocol):
    """What the experiment needs from a model: fastembed's `TextEmbedding`, or a fake."""

    def embed(self, documents: list[str]) -> object: ...

    def token_count(self, text: str) -> int: ...


def load_model(settings: Settings) -> TextEmbedding:
    """Load the embedding model, downloading it into the model cache on first use.

    Args:
        settings: Names the model and the cache directory.
    """
    return TextEmbedding(
        model_name=settings.embedding_model, cache_dir=str(settings.model_cache_dir)
    )


def embed_passages(model: Embedder, texts: list[str]) -> np.ndarray:
    """Embed texts as they are, one unit-length float32 row each."""
    vectors = np.array(list(model.embed(texts)), dtype=np.float32).reshape(len(texts), -1)
    # The model already returns unit vectors; the protocol must not depend on that.
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def embed_query(model: Embedder, question: str) -> np.ndarray:
    """Embed a question with the query prefix, as one unit-length float32 vector."""
    return embed_passages(model, [QUERY_PREFIX + question])[0]


def vector_bytes(vector: np.ndarray) -> bytes:
    """The bytes a vector is stored as."""
    return vector.astype(_STORED).tobytes()


def vector_from_bytes(data: bytes) -> np.ndarray:
    """A stored vector, back as a float32 array."""
    return np.frombuffer(data, dtype=_STORED).astype(np.float32)
