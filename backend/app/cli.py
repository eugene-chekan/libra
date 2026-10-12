"""Administrative commands."""

import argparse
import getpass
import os
import sys
from pathlib import Path

from sqlmodel import Session, select

from app.auth import hash_password, normalise_username
from app.config import get_settings
from app.db import get_engine, run_migrations
from app.models import User
from rag.corpus import (
    MAX_GENRE_GAP,
    CorpusError,
    book_stats,
    broken_rules,
    genre_gap,
    genre_words,
    load_corpus,
    read_corpus,
    write_stats,
)


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


def load_corpus_command(corpus_csv: Path, folder: Path) -> int:
    run_migrations()
    try:
        books = read_corpus(corpus_csv)
        tests = sum(1 for book in books if book.role == "test")
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

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return create_admin(args.username, if_missing=args.if_missing)
    if args.command == "rag" and args.rag_command == "load-corpus":
        return load_corpus_command(args.corpus_csv, args.folder)
    if args.command == "rag" and args.rag_command == "corpus-stats":
        return corpus_stats_command(args.corpus_csv, args.folder, args.out)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
