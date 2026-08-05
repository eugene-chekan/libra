"""Administrative commands.

The only way an account comes into existence without an existing admin. An
open registration endpoint on a self-hosted ebook server means the first
stranger to find it owns the library, so account creation lives here, behind
shell access to the host, and everything else goes through `POST /users`.

    uv run python -m app.cli create-admin --username eugene
"""

import argparse
import getpass
import os
import sys

from sqlmodel import Session, select

from app.auth import hash_password, normalise_username
from app.db import get_engine, run_migrations
from app.models import User


def _read_password() -> str:
    """Take the password from the environment, or prompt for it.

    `LIBRA_ADMIN_PASSWORD` exists for container entrypoints and scripted
    setup. There is deliberately no `--password` flag: an argument lands in
    shell history and in the process list, where anyone on the box can read
    it.
    """
    from_env = os.environ.get("LIBRA_ADMIN_PASSWORD")
    if from_env:
        return from_env

    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        raise SystemExit(1)
    return password


def create_admin(username: str) -> int:
    username = normalise_username(username)
    if not username:
        print("Username must not be empty.", file=sys.stderr)
        return 1

    # The database may not exist yet — this is plausibly the first command
    # ever run against a fresh install.
    run_migrations()

    with Session(get_engine()) as session:
        if session.exec(select(User).where(User.username == username)).first():
            print(f"User {username!r} already exists.", file=sys.stderr)
            return 1

        password = _read_password()
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)

    admin = subcommands.add_parser("create-admin", help="Create an admin user")
    admin.add_argument("--username", required=True)

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return create_admin(args.username)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
