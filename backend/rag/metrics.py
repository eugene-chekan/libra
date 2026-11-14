"""How well a method found each question's source chunk."""

K_VALUES = (5, 10)
MRR_K = 10


def rank_of(ranking: list[int], chunk_id: int) -> int | None:
    """Where a chunk is in a ranking, counting from 1; None when it is not there."""
    return ranking.index(chunk_id) + 1 if chunk_id in ranking else None


def recall_at(ranks: list[int | None], k: int) -> float:
    """The share of questions whose source chunk is in the first k."""
    return sum(1 for rank in ranks if rank is not None and rank <= k) / len(ranks)


def mrr_at(ranks: list[int | None], k: int = MRR_K) -> float:
    """The mean of 1 / rank, where a rank past k, or none, counts 0."""
    return sum(1 / rank for rank in ranks if rank is not None and rank <= k) / len(ranks)
