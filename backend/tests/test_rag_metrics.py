"""recall@k and MRR@10, on small cases worked by hand."""

import pytest

from rag.metrics import K_VALUES, MRR_K, mrr_at, rank_of, recall_at


def test_metrics_by_hand() -> None:
    ranks = [1, 3, None, 7, 12]

    assert {k: recall_at(ranks, k) for k in K_VALUES} == {5: 0.4, 10: 0.6}
    # Rank 12 is past MRR_K, so it counts as not found.
    assert mrr_at(ranks) == pytest.approx((1 + 1 / 3 + 1 / 7) / 5)
    assert mrr_at(ranks, MRR_K) == mrr_at(ranks)
    assert mrr_at(ranks, 12) == pytest.approx((1 + 1 / 3 + 1 / 7 + 1 / 12) / 5)


def test_rank_of_is_one_based_and_none_when_absent() -> None:
    assert rank_of([7, 9], 7) == 1
    assert rank_of([7, 9], 9) == 2
    assert rank_of([7, 9], 8) is None


def test_a_rank_at_k_counts_and_one_past_it_does_not() -> None:
    ranks = [5, 10, 11]

    assert recall_at(ranks, 5) == pytest.approx(1 / 3)
    assert recall_at(ranks, 10) == pytest.approx(2 / 3)
    assert mrr_at(ranks, 10) == pytest.approx((1 / 5 + 1 / 10) / 3)
