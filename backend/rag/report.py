"""The statistics, tables and chart of a run, computed from its ranks.csv alone."""

import csv
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from rag.corpus import CorpusError
from rag.evaluate import GENRES
from rag.metrics import K_VALUES
from rag.questions import QUESTION_KINDS
from rag.search import METHODS

# Protocol section 10.
SEED = 20261122
RESAMPLES = 10_000
CONFIDENCE = 0.95
ALPHA = 0.05
MAIN_K = max(K_VALUES)
METHOD = "dense+descriptors"
# H1 and H2: the method against these, in each genre.
BASELINES = {"H1": "dense", "H2": "bm25+dense"}

# A validated two-slot categorical palette on a light surface, one colour per genre.
_SURFACE = "#fcfcfb"
_INK = "#0b0b0b"
_MUTED = "#52514e"
_GENRE_COLOURS = {"fiction": "#2a78d6", "non-fiction": "#eb6834"}


@dataclass(frozen=True)
class Test:
    """One hypothesis test: a mean difference in recall@10, its interval and p-values."""

    name: str
    family: str
    comparison: str
    questions: int
    difference: float
    low: float
    high: float
    p: float
    p_holm: float | None


def read_ranks(path: Path) -> list[dict]:
    """Read a run's ranks.csv; an empty rank becomes None.

    Raises:
        CorpusError: The file does not exist.
    """
    if not path.exists():
        raise CorpusError(f"{path} does not exist; run rag evaluate first")
    with path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        row["rank"] = int(row["rank"]) if row["rank"] else None
    return rows


def hits(rows: list[dict], method: str, keep: Callable[[dict], bool]) -> np.ndarray:
    """1 where the method put the source chunk in its first MAIN_K, else 0; by question id."""
    mine = sorted(
        (row for row in rows if row["method"] == method and keep(row)),
        key=lambda row: row["question"],
    )
    return np.array(
        [1.0 if row["rank"] is not None and row["rank"] <= MAIN_K else 0.0 for row in mine]
    )


def _rng() -> np.random.Generator:
    # Each test starts from the same seed, so its result does not depend on the order.
    return np.random.default_rng(SEED)


def _mean_difference(x: np.ndarray, y: np.ndarray, axis: int = -1) -> np.ndarray:
    return np.mean(x, axis=axis) - np.mean(y, axis=axis)


def paired_test(method: np.ndarray, baseline: np.ndarray) -> tuple[float, float, float, float]:
    """The mean of (method - baseline) per question, its interval, and a two-sided p-value.

    The interval is a percentile bootstrap of the differences; the p-value is a paired
    randomisation test that swaps the two methods within each question.
    """
    from scipy import stats

    differences = method - baseline
    interval = stats.bootstrap(
        (differences,),
        np.mean,
        n_resamples=RESAMPLES,
        confidence_level=CONFIDENCE,
        method="percentile",
        rng=_rng(),
    ).confidence_interval
    p = stats.permutation_test(
        (method, baseline),
        _mean_difference,
        permutation_type="samples",
        vectorized=True,
        n_resamples=RESAMPLES,
        alternative="two-sided",
        rng=_rng(),
    ).pvalue
    return float(differences.mean()), float(interval.low), float(interval.high), float(p)


def gain_difference_test(
    first: np.ndarray, second: np.ndarray
) -> tuple[float, float, float, float]:
    """The difference between two groups' mean gains, its interval, and a two-sided p-value.

    The groups hold different questions: the bootstrap resamples each group on its own,
    and the randomisation test shuffles the group labels.
    """
    from scipy import stats

    interval = stats.bootstrap(
        (first, second),
        _mean_difference,
        vectorized=True,
        n_resamples=RESAMPLES,
        confidence_level=CONFIDENCE,
        method="percentile",
        rng=_rng(),
    ).confidence_interval
    p = stats.permutation_test(
        (first, second),
        _mean_difference,
        permutation_type="independent",
        vectorized=True,
        n_resamples=RESAMPLES,
        alternative="two-sided",
        rng=_rng(),
    ).pvalue
    difference = float(first.mean() - second.mean())
    return difference, float(interval.low), float(interval.high), float(p)


def holm(pvalues: list[float]) -> list[float]:
    """Holm's step-down adjustment of a family of p-values, in their given order."""
    order = sorted(range(len(pvalues)), key=lambda i: pvalues[i])
    adjusted = [0.0] * len(pvalues)
    running = 0.0
    for step, index in enumerate(order):
        running = max(running, min(1.0, (len(pvalues) - step) * pvalues[index]))
        adjusted[index] = running
    return adjusted


def run_tests(rows: list[dict]) -> list[Test]:
    """H1 and H2 in each genre and H3 (the main family, Holm-corrected), and H4."""

    def gains(keep: Callable[[dict], bool]) -> np.ndarray:
        return hits(rows, METHOD, keep) - hits(rows, BASELINES["H1"], keep)

    def genre(name: str) -> Callable[[dict], bool]:
        return lambda row: row["genre"] == name

    def kind(name: str) -> Callable[[dict], bool]:
        return lambda row: row["kind"] == name

    main = []
    for hypothesis, baseline in BASELINES.items():
        for name in GENRES:
            method_hits = hits(rows, METHOD, genre(name))
            baseline_hits = hits(rows, baseline, genre(name))
            result = paired_test(method_hits, baseline_hits)
            comparison = f"{METHOD} vs {baseline}, {name}"
            main.append((f"{hypothesis} {name}", comparison, len(method_hits), result))
    fiction, non_fiction = (gains(genre(name)) for name in GENRES)
    main.append(
        (
            "H3",
            f"H1 gain on {GENRES[0]} vs on {GENRES[1]}",
            len(fiction) + len(non_fiction),
            gain_difference_test(fiction, non_fiction),
        )
    )
    adjusted = holm([result[3] for *_, result in main])
    tests = [
        Test(name, "main", comparison, n, *result, p_holm=p_holm)
        for (name, comparison, n, result), p_holm in zip(main, adjusted, strict=True)
    ]
    interpretive, factual = (gains(kind(name)) for name in reversed(QUESTION_KINDS))
    tests.append(
        Test(
            "H4",
            "secondary",
            f"H1 gain on {QUESTION_KINDS[1]} vs on {QUESTION_KINDS[0]}",
            len(interpretive) + len(factual),
            *gain_difference_test(interpretive, factual),
            p_holm=None,
        )
    )
    return tests


def recall_table(rows: list[dict]) -> list[dict]:
    """recall@MAIN_K of each method in each genre and over all, with a bootstrap interval."""
    from scipy import stats

    table = []
    for method in METHODS:
        for name in ("all", *GENRES):
            values = hits(rows, method, lambda row, n=name: n in ("all", row["genre"]))
            interval = stats.bootstrap(
                (values,),
                np.mean,
                n_resamples=RESAMPLES,
                confidence_level=CONFIDENCE,
                method="percentile",
                rng=_rng(),
            ).confidence_interval
            table.append(
                {
                    "method": method,
                    "genre": name,
                    "questions": len(values),
                    f"recall@{MAIN_K}": round(float(values.mean()), 4),
                    "low": round(float(interval.low), 4),
                    "high": round(float(interval.high), 4),
                }
            )
    return table


def write_report(run: Path) -> None:
    """Write tests.csv, recall.csv, report.md and recall.png into a run folder.

    Raises:
        CorpusError: The run has no ranks.csv, or it has a report already.
    """
    rows = read_ranks(run / "ranks.csv")
    if (run / "report.md").exists():
        raise CorpusError(f"{run} has a report already; a report never writes over another")
    tests = run_tests(rows)
    table = recall_table(rows)
    _write_csv(run / "tests.csv", [asdict(test) for test in tests])
    _write_csv(run / "recall.csv", table)
    _chart(table, run / "recall.png")
    (run / "report.md").write_text(_markdown(tests, table), encoding="utf-8", newline="\n")


def _write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _points(value: float) -> str:
    return f"{value * 100:+.1f}"


def _markdown(tests: list[Test], table: list[dict]) -> str:
    lines = [
        "# Report",
        "",
        f"All numbers are recall@{MAIN_K}: the share of questions whose source chunk is in a",
        f"method's first {MAIN_K}. Intervals are {CONFIDENCE:.0%} percentile bootstrap intervals,",
        f"{RESAMPLES:,} resamples, seed {SEED}. p-values are two-sided randomisation tests.",
        f"The main family (H1, H2 per genre, and H3) is Holm-corrected at {ALPHA}; H4 is not.",
        "",
        "## The hypotheses",
        "",
        "| Test | Comparison | Questions | Difference (points) | Interval | p | p (Holm) |",
        "|---|---|---|---|---|---|---|",
    ]
    for test in tests:
        holm_p = "—" if test.p_holm is None else f"{test.p_holm:.4f}"
        lines.append(
            f"| {test.name} | {test.comparison} | {test.questions} | {_points(test.difference)} "
            f"| {_points(test.low)} to {_points(test.high)} | {test.p:.4f} | {holm_p} |"
        )
    lines += [
        "",
        f"## recall@{MAIN_K} by method and genre",
        "",
        "| Method | Genre | Questions | recall | Interval |",
        "|---|---|---|---|---|",
    ]
    for line in table:
        lines.append(
            f"| {line['method']} | {line['genre']} | {line['questions']} "
            f"| {line[f'recall@{MAIN_K}']:.3f} | {line['low']:.3f} to {line['high']:.3f} |"
        )
    lines += ["", "![recall by method and genre](recall.png)", ""]
    return "\n".join(lines)


def _chart(table: list[dict], path: Path) -> None:
    """Horizontal bars of recall per method, one bar per genre, with interval whiskers."""
    import matplotlib

    matplotlib.use("Agg")
    from matplotlib import pyplot as plt

    figure, axes = plt.subplots(figsize=(8, 5), dpi=150)
    figure.patch.set_facecolor(_SURFACE)
    axes.set_facecolor(_SURFACE)
    height = 0.36
    for offset, name in ((-height / 2, GENRES[0]), (height / 2, GENRES[1])):
        lines = [line for line in table if line["genre"] == name]
        centres = [METHODS.index(line["method"]) + offset for line in lines]
        values = [line[f"recall@{MAIN_K}"] for line in lines]
        errors = [
            [v - line["low"] for v, line in zip(values, lines, strict=True)],
            [line["high"] - v for v, line in zip(values, lines, strict=True)],
        ]
        axes.barh(
            centres,
            values,
            height=height - 0.04,
            color=_GENRE_COLOURS[name],
            label=name,
            xerr=errors,
            error_kw={"ecolor": _MUTED, "elinewidth": 1, "capsize": 2},
        )
    axes.set_yticks(range(len(METHODS)), METHODS, color=_INK)
    axes.invert_yaxis()
    axes.set_xlim(0, 1)
    axes.set_xlabel(f"recall@{MAIN_K}", color=_INK)
    axes.tick_params(colors=_MUTED)
    axes.grid(axis="x", color="#e4e3df", linewidth=0.8)
    axes.set_axisbelow(True)
    for side in ("top", "right", "left"):
        axes.spines[side].set_visible(False)
    axes.spines["bottom"].set_color(_MUTED)
    # Below the axis label: inside the axes, the legend covers the longest bars.
    axes.legend(
        frameon=False,
        labelcolor=_INK,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.14),
        ncol=len(GENRES),
    )
    axes.set_title(
        f"recall@{MAIN_K} by method and genre, with {CONFIDENCE:.0%} intervals",
        color=_INK,
        loc="left",
    )
    figure.tight_layout()
    figure.savefig(path, facecolor=_SURFACE)
    plt.close(figure)
