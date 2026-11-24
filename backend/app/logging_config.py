"""Application logging."""

import json
import logging
from datetime import UTC, datetime

LOGGER_NAMESPACE = "libra"

_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"

# uvicorn configures these itself and owns their handlers. Touching them is
# how migrations silently disabled access logging for a whole process — see
# the fileConfig fix in alembic/env.py.
_FOREIGN_LOGGERS = ("uvicorn", "uvicorn.access", "uvicorn.error")

# Every attribute a plain LogRecord has. Anything else on a record came from `extra=`.
_STANDARD_FIELDS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {
    "message",
    "asctime",
}


class JsonFormatter(logging.Formatter):
    """One JSON object per line: time, level, logger, message, and any `extra=` fields."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_FIELDS and not key.startswith("_"):
                entry[key] = value
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def get_logger(name: str) -> logging.Logger:
    """A logger under the app's namespace."""
    suffix = name.removeprefix("app.")
    return logging.getLogger(f"{LOGGER_NAMESPACE}.{suffix}")


def configure_logging(level: str, log_format: str = "text") -> None:
    """Attach a handler to the app's namespace only.

    Args:
        level: The lowest level to write, such as `INFO`.
        log_format: `text` for a person reading a terminal, `json` for a log collector.
    """
    logger = logging.getLogger(LOGGER_NAMESPACE)
    logger.setLevel(level.upper())

    # Our records are handled here and must not also bubble up to root,
    # where uvicorn's handler would print them a second time.
    logger.propagate = False

    formatter = JsonFormatter() if log_format == "json" else logging.Formatter(_FORMAT)
    if not logger.handlers:
        handler = logging.StreamHandler()
        logger.addHandler(handler)
    for handler in logger.handlers:
        handler.setFormatter(formatter)


__all__ = ["LOGGER_NAMESPACE", "JsonFormatter", "configure_logging", "get_logger"]
