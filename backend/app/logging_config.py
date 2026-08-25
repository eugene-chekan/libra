"""Application logging."""

import logging

LOGGER_NAMESPACE = "libra"

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"

# uvicorn configures these itself and owns their handlers. Touching them is
# how migrations silently disabled access logging for a whole process — see
# the fileConfig fix in alembic/env.py.
_FOREIGN_LOGGERS = ("uvicorn", "uvicorn.access", "uvicorn.error")


def get_logger(name: str) -> logging.Logger:
    """A logger under the app's namespace."""
    suffix = name.removeprefix("app.")
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{suffix}")


def configure_logging(level: str) -> None:
    """Attach a handler to the app's namespace only."""
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
