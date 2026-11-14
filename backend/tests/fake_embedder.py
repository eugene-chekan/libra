"""A stand-in for the embedding model, so ordinary tests never load the real one."""

import hashlib
from collections.abc import Iterable, Iterator

import numpy as np


class FakeEmbedder:
    """Like fastembed's `TextEmbedding`: `embed` yields one vector per text, lazily.

    Each vector depends only on its text. It is deliberately not unit length, so
    unit vectors in a test prove the code under test normalised them.
    """

    def __init__(self, dim: int = 8, fail_on_call: int | None = None) -> None:
        self.dim = dim
        self.fail_on_call = fail_on_call
        self.calls = 0
        self.embedded: list[str] = []

    def embed(self, documents: Iterable[str], **kwargs: object) -> Iterator[np.ndarray]:
        self.calls += 1
        if self.calls == self.fail_on_call:
            raise RuntimeError("the fake model failed")
        for text in documents:
            self.embedded.append(text)
            seed = int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "little")
            yield 3.0 * np.random.default_rng(seed).standard_normal(self.dim).astype(np.float32)

    def token_count(self, text: str, **kwargs: object) -> int:
        return len(text.split())
