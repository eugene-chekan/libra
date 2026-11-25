"""Administrative commands."""

import argparse
import functools
import getpass
import os
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import inspect
from sqlmodel import Session, select

from app.auth import hash_password, normalise_username
from app.config import get_settings
from app.db import get_engine, run_migrations
from app.models import User
from rag.corpus import (
    MAX_GENRE_GAP,
    CorpusBook,
    CorpusError,
    book_stats,
    broken_rules,
    genre_gap,
    genre_words,
    load_corpus,
    read_corpus,
    read_digests,
    refuse_foreign_books,
    verify_files,
    write_stats,
)
from rag.questions import read_records, run_session


def _read_password(username: str) -> str:
    """Take the password from the environment, or prompt for it."""
    from_env = os.environ.get("LIBRA_ADMIN_PASSWORD")
    if from_env:
        return from_env

    print(f"Creating the first account: {username!r}.")
    password = getpass.getpass(f"Choose a password for {username!r}: ")
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        raise SystemExit(1)
    return password


def create_admin(username: str, *, if_missing: bool = False) -> int:
    username = normalise_username(username)
    if not username:
        print("Username must not be empty.", file=sys.stderr)
        return 1

    # The database may not exist yet — this is plausibly the first command
    # ever run against a fresh install.
    run_migrations()

    with Session(get_engine()) as session:
        # `--if-missing` asks "does this installation have anybody yet?", not
        # "does this name exist?". A start script runs on every boot, and the
        # per-name check would happily add a second admin the first time
        # someone ran it with a different username.
        if if_missing and session.exec(select(User)).first():
            print("An account already exists; leaving accounts alone.")
            return 0

        if session.exec(select(User).where(User.username == username)).first():
            print(f"User {username!r} already exists.", file=sys.stderr)
            return 1

        password = _read_password(username)
        if not password:
            print("Password must not be empty.", file=sys.stderr)
            return 1

        session.add(
            User(
                username=username,
                password_hash=hash_password(password),
                is_admin=True,
            )
        )
        session.commit()

    print(f"Created admin user {username!r}.")
    return 0


def _open_experiment_database(books: list[CorpusBook]) -> None:
    """Refuse a database that holds other books, and only then migrate it.

    Raises:
        CorpusError: It holds a book that is not in the list.
    """
    # Before migrating: a real library pointed at by mistake must be refused
    # before anything is written to it.
    if inspect(get_engine()).has_table("book"):
        with Session(get_engine()) as session:
            refuse_foreign_books(session, books)
    run_migrations()


def load_corpus_command(corpus_csv: Path, folder: Path) -> int:
    try:
        books = read_corpus(corpus_csv)
        tests = sum(1 for book in books if book.role == "test")
        _open_experiment_database(books)
        with Session(get_engine()) as session:
            added = load_corpus(session, books, folder, get_settings())
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"Added {added} of {tests} test books; {tests - added} were already here.")
    return 0


def corpus_stats_command(corpus_csv: Path, folder: Path, out: Path) -> int:
    # Imported here: fastembed takes a second to import, and create-admin runs on
    # every boot.
    from rag.embeddings import load_model

    try:
        books = read_corpus(corpus_csv)
        stats = book_stats(books, folder, load_model(get_settings()).token_count)
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    write_stats(stats, out)
    print(f"Test words by genre: {genre_words(stats)}")
    print(f"Gap: {genre_gap(stats):.1%} (limit {MAX_GENRE_GAP:.0%})")
    largest = max((s.max_tokens for s in stats), default=0)
    print(f"Chunks: {sum(s.chunks for s in stats)}; largest {largest} tokens")
    problems = broken_rules(stats)
    for problem in problems:
        print(f"rule broken: {problem}", file=sys.stderr)
    return 1 if problems else 0


def hand_question_command(corpus_csv: Path, folder: Path, stats_csv: Path, out: Path) -> int:
    from rag.embeddings import load_model

    # Book text holds characters, such as U+FEFF, that a Windows code page lacks when
    # the output goes to a pipe or a file.
    sys.stdout.reconfigure(errors="replace")
    try:
        books = read_corpus(corpus_csv)
        verify_files([book for book in books if book.role == "test"], folder)
        digests = read_digests(stats_csv)
        out.parent.mkdir(parents=True, exist_ok=True)
        count_tokens = load_model(get_settings()).token_count
        kept = run_session(books, folder, digests, count_tokens, out, input, print, date.today())
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print(f"\nStopped. Every answer you finished is saved in {out}.")
        return 0
    print(f"Kept {kept} question(s) in this session. The answers file is {out}.")
    return 0


def review_command(corpus_csv: Path, drafts: Path, out: Path) -> int:
    from rag.review import run_review

    # As in hand_question_command: book text holds characters a Windows code page lacks.
    sys.stdout.reconfigure(errors="replace")
    try:
        books = read_corpus(corpus_csv)
        _open_experiment_database(books)
        with Session(get_engine()) as session:
            reviewed = run_review(session, books, drafts, out, input, print, date.today())
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print(f"\nStopped. Every decision you finished is saved in {out}.")
        return 0
    print(f"Reviewed {reviewed} draft(s) in this session. The review file is {out}.")
    return 0


def index_command(corpus_csv: Path, stats_csv: Path) -> int:
    from rag.embeddings import load_model
    from rag.index import index_books

    try:
        books = read_corpus(corpus_csv)
        digests = read_digests(stats_csv)
        _open_experiment_database(books)
        settings = get_settings()
        model = load_model(settings)
        with Session(get_engine()) as session:
            # Flushed, so a log file shows each book as it is stored.
            progress = functools.partial(print, flush=True)
            indexed, already = index_books(session, books, digests, settings, model, progress)
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"Indexed {indexed} books; {already} were already indexed.")
    return 0


def describe_questions_command(
    hand: Path, review: Path | None, out: Path, workers: int | None
) -> int:
    import openai

    from rag.deepseek import DeepSeek, MissingKeyError, StopRunError
    from rag.descriptors import RUN_WORKERS, run_describe_questions
    from rag.review import read_reviews
    from rag.smoke import require_hand_set

    try:
        deepseek = DeepSeek(get_settings())
        hand_records = read_records(hand)
        require_hand_set(hand_records)
        records = [*hand_records, *(read_reviews(review) if review else [])]
        count = RUN_WORKERS if workers is None else workers
        progress = functools.partial(print, flush=True)
        ok, failed = run_describe_questions(records, deepseek, out, count, progress)
    except (CorpusError, MissingKeyError, StopRunError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except openai.APIError as exc:
        _report_failed_request(exc, out)
        return 1
    except KeyboardInterrupt:
        print(f"\nStopped. Every answer that arrived is saved in {out}.")
        return 0
    print(f"{ok} ok, {failed} failed in this run. The log is {out}.")
    return 0


def draft_questions_command(
    corpus_csv: Path, hand: Path, out: Path, workers: int | None, limit: int | None
) -> int:
    import openai

    from rag.deepseek import DeepSeek, MissingKeyError, StopRunError
    from rag.descriptors import RUN_WORKERS
    from rag.drafts import run_drafts
    from rag.smoke import require_hand_set

    try:
        deepseek = DeepSeek(get_settings())
        books = read_corpus(corpus_csv)
        records = read_records(hand)
        require_hand_set(records)
        _open_experiment_database(books)
        with Session(get_engine()) as session:
            count = RUN_WORKERS if workers is None else workers
            progress = functools.partial(print, flush=True)
            ok, failed = run_drafts(session, books, records, deepseek, out, count, progress, limit)
    except (CorpusError, MissingKeyError, StopRunError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except openai.APIError as exc:
        _report_failed_request(exc, out)
        return 1
    except KeyboardInterrupt:
        print(f"\nStopped. Every draft that arrived is saved in {out}.")
        return 0
    print(f"{ok} ok, {failed} failed in this run. The log is {out}.")
    return 0


def import_descriptors_command(corpus_csv: Path, log: Path) -> int:
    from rag.descriptors import import_descriptors, read_log
    from rag.embeddings import load_model

    try:
        books = read_corpus(corpus_csv)
        entries = read_log(log)
        _open_experiment_database(books)
        settings = get_settings()
        model = load_model(settings)
        with Session(get_engine()) as session:
            progress = functools.partial(print, flush=True)
            imported, already, failed = import_descriptors(
                session, books, entries, settings, model, progress
            )
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"Imported {imported} books; {already} were already imported. "
        f"{failed} chunks of the imported books have no valid descriptors."
    )
    return 0


def evaluate_command(
    corpus_csv: Path,
    stats_csv: Path,
    hand: Path,
    drafts: Path,
    review: Path,
    query_log: Path,
    chunk_log: Path,
    out: Path,
) -> int:
    from rag.descriptors import PROMPT_VERSION, read_log
    from rag.embeddings import load_model
    from rag.evaluate import (
        check_stored_chunks,
        load_questions,
        rank_questions,
        require_new_run,
        summarize,
        write_run,
    )
    from rag.review import read_reviews, require_review_done
    from rag.search import METHODS, DescriptorIndex, VectorIndex
    from rag.smoke import require_hand_set

    try:
        books = read_corpus(corpus_csv)
        digests = read_digests(stats_csv)
        records = read_records(hand)
        require_hand_set(records)
        reviews = read_reviews(review)
        require_review_done(reviews, read_log(drafts))
        queries = read_log(query_log)
        require_new_run(out)
        _open_experiment_database(books)
        settings = get_settings()
        model = load_model(settings)
        with Session(get_engine()) as session:
            check_stored_chunks(session, books, digests)
            vectors = VectorIndex.load(session, settings.embedding_model)
            descriptors = DescriptorIndex.load(session, PROMPT_VERSION, settings.embedding_model)
            questions = [
                *load_questions(session, records, queries, model, "hand"),
                *load_questions(session, reviews, queries, model, "drafted"),
            ]
            progress = functools.partial(print, flush=True)
            rows = rank_questions(session, vectors, descriptors, model, questions, progress)
        summary = summarize(rows)
        inputs = {
            "corpus.csv": corpus_csv,
            "corpus-stats.csv": stats_csv,
            "hand.jsonl": hand,
            "drafts.jsonl": drafts,
            "review.jsonl": review,
            "query-descriptors.jsonl": query_log,
            "descriptors.jsonl": chunk_log,
        }
        facts = {"git_commit": _git_commit(), "embedding_model": settings.embedding_model}
        write_run(out, rows, summary, inputs, facts)
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"Ranked {len(questions)} questions by {len(METHODS)} methods. The run is in {out}.")
    return 0


def report_command(run: Path) -> int:
    from rag.report import write_report

    try:
        write_report(run)
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"The report is {run / 'report.md'}.")
    return 0


def _git_commit() -> str | None:
    """The checked-out commit, with "-dirty" when files differ from it; None outside git."""
    import subprocess

    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
        changed = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return f"{head}-dirty" if changed else head


def smoke_command(hand: Path, sample: int) -> int:
    from rag.embeddings import load_model
    from rag.metrics import K_VALUES
    from rag.search import VectorIndex
    from rag.smoke import require_hand_set, smoke

    try:
        records = read_records(hand)
        require_hand_set(records)
        settings = get_settings()
        with Session(get_engine()) as session:
            vectors = VectorIndex.load(session, settings.embedding_model)
            recall = smoke(session, vectors, load_model(settings), records, sample)
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"Self-retrieval of {sample} chunks from their first words. Not an experiment result.")
    for method, value in recall.items():
        print(f"{method}: recall@{max(K_VALUES)} = {value:.2f}")
    return 0


def _report_failed_request(exc: Exception, out: Path) -> None:
    # Only the kind of error and its status: a server's message can repeat the key.
    status = getattr(exc, "status_code", "no answer")
    print(
        f"error: the request to DeepSeek failed ({type(exc).__name__}, {status}). "
        f"Every answer before it is saved in {out}; run the command again to go on.",
        file=sys.stderr,
    )


def pilot_describe_command(
    corpus_csv: Path, folder: Path, stats_csv: Path, out: Path, sample: int, questions: Path | None
) -> int:
    import openai

    from rag.deepseek import DeepSeek, MissingKeyError, StopRunError
    from rag.descriptors import run_pilot
    from rag.embeddings import load_model

    sys.stdout.reconfigure(errors="replace")
    try:
        deepseek = DeepSeek(get_settings())
        books = [book for book in read_corpus(corpus_csv) if book.role == "pilot"]
        verify_files(books, folder)
        digests = read_digests(stats_csv)
        lines = questions.read_text(encoding="utf-8").splitlines() if questions else []
        count_tokens = load_model(get_settings()).token_count
        ok, failed = run_pilot(
            books,
            folder,
            digests,
            count_tokens,
            deepseek,
            out,
            sample,
            [line.strip() for line in lines if line.strip()],
            print,
        )
    except (CorpusError, MissingKeyError, StopRunError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except openai.APIError as exc:
        _report_failed_request(exc, out)
        return 1
    print(f"{ok} ok, {failed} failed in this run. The log is {out}.")
    return 0


def describe_command(corpus_csv: Path, out: Path, workers: int | None, limit: int | None) -> int:
    import openai

    from rag.deepseek import DeepSeek, MissingKeyError, StopRunError
    from rag.descriptors import RUN_WORKERS, run_describe

    try:
        deepseek = DeepSeek(get_settings())
        books = read_corpus(corpus_csv)
        _open_experiment_database(books)
        with Session(get_engine()) as session:
            # Flushed, so a log file shows each answer as it is logged.
            progress = functools.partial(print, flush=True)
            count = RUN_WORKERS if workers is None else workers
            ok, failed = run_describe(session, books, deepseek, out, count, progress, limit)
    except (CorpusError, MissingKeyError, StopRunError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except openai.APIError as exc:
        _report_failed_request(exc, out)
        return 1
    except KeyboardInterrupt:
        print(f"\nStopped. Every answer that arrived is saved in {out}.")
        return 0
    print(f"{ok} ok, {failed} failed in this run. The log is {out}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    admin = subcommands.add_parser("create-admin", help="Create an admin user")
    admin.add_argument("--username", required=True)
    admin.add_argument(
        "--if-missing",
        action="store_true",
        help="Do nothing (and succeed) if the installation already has any user",
    )

    rag = subcommands.add_parser("rag", help="Phase 2 retrieval experiment")
    rag_commands = rag.add_subparsers(dest="rag_command", required=True)
    load = rag_commands.add_parser("load-corpus", help="Add the corpus test books to this database")
    load.add_argument("corpus_csv", type=Path)
    load.add_argument("folder", type=Path)
    stats = rag_commands.add_parser(
        "corpus-stats", help="Chunk every corpus book and check the corpus rules"
    )
    stats.add_argument("corpus_csv", type=Path)
    stats.add_argument("folder", type=Path)
    stats.add_argument("--out", type=Path, required=True)
    hand = rag_commands.add_parser(
        "hand-question", help="Write the hand questions, one chunk at a time; resumes"
    )
    hand.add_argument("corpus_csv", type=Path)
    hand.add_argument("folder", type=Path)
    hand.add_argument("--stats", type=Path, required=True, help="corpus-stats.csv")
    hand.add_argument("--out", type=Path, required=True, help="hand.jsonl")
    index = rag_commands.add_parser(
        "index", help="Store the test books' chunks and vectors for search; resumes"
    )
    index.add_argument("corpus_csv", type=Path)
    index.add_argument("--stats", type=Path, required=True, help="corpus-stats.csv")
    smoke = rag_commands.add_parser(
        "smoke", help="Check the index finds chunks from their first words (after the hand set)"
    )
    smoke.add_argument("--hand", type=Path, required=True, help="hand.jsonl")
    smoke.add_argument("--sample", type=int, default=30)
    pilot = rag_commands.add_parser(
        "pilot-describe", help="Try the descriptor prompt on chunks of the 2 pilot books; resumes"
    )
    pilot.add_argument("corpus_csv", type=Path)
    pilot.add_argument("folder", type=Path)
    pilot.add_argument("--stats", type=Path, required=True, help="corpus-stats.csv")
    pilot.add_argument("--out", type=Path, required=True, help="The response log, a .jsonl file")
    pilot.add_argument("--sample", type=int, default=20, help="Chunks per pilot book")
    pilot.add_argument("--questions", type=Path, help="A text file, one question per line")
    describe = rag_commands.add_parser(
        "describe", help="Write descriptors for every chunk of the test books; resumes"
    )
    describe.add_argument("corpus_csv", type=Path)
    describe.add_argument("--out", type=Path, required=True, help="The response log, a .jsonl file")
    describe.add_argument(
        "--workers", type=int, help="Requests at once (default: the most the protocol allows)"
    )
    describe.add_argument("--limit", type=int, help="Ask for at most this many chunks")
    questions = rag_commands.add_parser(
        "describe-questions", help="Write descriptors for every kept hand question; resumes"
    )
    questions.add_argument("--hand", type=Path, required=True, help="hand.jsonl")
    questions.add_argument(
        "--review", type=Path, help="review.jsonl; its kept and edited drafts are described too"
    )
    questions.add_argument(
        "--out", type=Path, required=True, help="The question descriptor log, a .jsonl file"
    )
    questions.add_argument(
        "--workers", type=int, help="Requests at once (default: the most the protocol allows)"
    )
    drafts = rag_commands.add_parser(
        "draft-questions", help="Draft one question for each picked chunk of the test books"
    )
    drafts.add_argument("corpus_csv", type=Path)
    drafts.add_argument("--hand", type=Path, required=True, help="hand.jsonl")
    drafts.add_argument("--out", type=Path, required=True, help="The draft log, a .jsonl file")
    drafts.add_argument(
        "--workers", type=int, help="Requests at once (default: the most the protocol allows)"
    )
    drafts.add_argument("--limit", type=int, help="Ask for at most this many drafts")
    report = rag_commands.add_parser(
        "report", help="Statistics, tables and a chart for a run; needs the experiment group"
    )
    report.add_argument("run", type=Path, help="A run folder written by rag evaluate")
    review = rag_commands.add_parser(
        "review", help="Keep, edit or drop each drafted question, one at a time; resumes"
    )
    review.add_argument("corpus_csv", type=Path)
    review.add_argument("--drafts", type=Path, required=True, help="drafts.jsonl")
    review.add_argument("--out", type=Path, required=True, help="review.jsonl")
    evaluate = rag_commands.add_parser(
        "evaluate", help="Rank every question's source chunk by every method; writes a run"
    )
    evaluate.add_argument("corpus_csv", type=Path)
    evaluate.add_argument("--stats", type=Path, required=True, help="corpus-stats.csv")
    evaluate.add_argument("--hand", type=Path, required=True, help="hand.jsonl")
    evaluate.add_argument("--drafts", type=Path, required=True, help="drafts.jsonl")
    evaluate.add_argument("--review", type=Path, required=True, help="review.jsonl")
    evaluate.add_argument(
        "--query-descriptors", type=Path, required=True, help="The question descriptor log"
    )
    evaluate.add_argument(
        "--descriptors", type=Path, required=True, help="The chunk descriptor log"
    )
    evaluate.add_argument("--out", type=Path, required=True, help="A new run folder")
    imports = rag_commands.add_parser(
        "import-descriptors", help="Load the chunk descriptor log into the database; no API"
    )
    imports.add_argument("corpus_csv", type=Path)
    imports.add_argument("--log", type=Path, required=True, help="The response log, a .jsonl file")

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return create_admin(args.username, if_missing=args.if_missing)
    if args.command == "rag" and args.rag_command == "load-corpus":
        return load_corpus_command(args.corpus_csv, args.folder)
    if args.command == "rag" and args.rag_command == "corpus-stats":
        return corpus_stats_command(args.corpus_csv, args.folder, args.out)
    if args.command == "rag" and args.rag_command == "hand-question":
        return hand_question_command(args.corpus_csv, args.folder, args.stats, args.out)
    if args.command == "rag" and args.rag_command == "index":
        return index_command(args.corpus_csv, args.stats)
    if args.command == "rag" and args.rag_command == "smoke":
        return smoke_command(args.hand, args.sample)
    if args.command == "rag" and args.rag_command == "describe-questions":
        return describe_questions_command(args.hand, args.review, args.out, args.workers)
    if args.command == "rag" and args.rag_command == "draft-questions":
        return draft_questions_command(
            args.corpus_csv, args.hand, args.out, args.workers, args.limit
        )
    if args.command == "rag" and args.rag_command == "report":
        return report_command(args.run)
    if args.command == "rag" and args.rag_command == "review":
        return review_command(args.corpus_csv, args.drafts, args.out)
    if args.command == "rag" and args.rag_command == "evaluate":
        return evaluate_command(
            args.corpus_csv,
            args.stats,
            args.hand,
            args.drafts,
            args.review,
            args.query_descriptors,
            args.descriptors,
            args.out,
        )
    if args.command == "rag" and args.rag_command == "import-descriptors":
        return import_descriptors_command(args.corpus_csv, args.log)
    if args.command == "rag" and args.rag_command == "describe":
        return describe_command(args.corpus_csv, args.out, args.workers, args.limit)
    if args.command == "rag" and args.rag_command == "pilot-describe":
        return pilot_describe_command(
            args.corpus_csv, args.folder, args.stats, args.out, args.sample, args.questions
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
