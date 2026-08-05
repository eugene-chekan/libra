"""Application logging.

Deliberately small. One process serving one household, read through
`docker logs` or journald — so this configures levels and a format and
nothing else. No file handlers, no rotation, no JSON: those solve problems
that come with fleets and log aggregators, and here they would be machinery
with no reader.

What logging is *for* in this codebase is narrower than "observability". It
covers the handful of places where the code deliberately keeps going after
something went wrong, and would otherwise never tell anyone:

- a stored file that could not be deleted, leaving a stray file on disk
- the same-filesystem assumption breaking, turning a rename into a copy
- an orphaned file cleaned up after a failed insert
- a rejected login
- a schema that moved underneath a running deployment

Plus the "details server-side only" promise that the Kindle delivery and
format conversion specs both make: the client gets a generic message, the
operator gets the real one.
"""

import logging

LOGGER_NAMESPACE = "libra"

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"

# uvicorn configures these itself and owns their handlers. Touching them is
# how migrations silently disabled access logging for a whole process — see
# the fileConfig fix in alembic/env.py.
_FOREIGN_LOGGERS = ("uvicorn", "uvicorn.access", "uvicorn.error")


def get_logger(name: str) -> logging.Logger:
    """A logger under the app's namespace.

    Call as `get_logger(__name__)`; `app.storage` becomes `libra.storage`,
    so one level setting governs the whole application and nothing else.
    """
    suffix = name.removeprefix("app.")
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{suffix}")


def configure_logging(level: str) -> None:
    """Attach a handler to the app's namespace only.

    Configuring the *root* logger would be the obvious move and is wrong
    here: uvicorn has already set up its own handlers by the time the app is
    created, so adding another to root duplicates every access line. Owning
    exactly one logger — `libra` — leaves everyone else's output as it was.

    Idempotent, because `create_app()` runs per-test as well as once per
    process, and re-running it must not stack up handlers that multiply
    every message.
    """
    logger = logging.getLogger(LOGGER_NAMESPACE)
    logger.setLevel(level.upper())

    # Our records are handled here and must not also bubble up to root,
    # where uvicorn's handler would print them a second time.
    logger.propagate = False

    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(_FORMAT))
        logger.addHandler(handler)
    else:
        for handler in logger.handlers:
            handler.setFormatter(logging.Formatter(_FORMAT))


__all__ = ["LOGGER_NAMESPACE", "configure_logging", "get_logger"]
