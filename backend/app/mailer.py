"""Message construction and SMTP transport.

Split from the delivery logic so tests can replace `send_message` without a
mail server, and so the parts that are easy to get subtly wrong — the encoded
size and the attachment filename — sit in one place with their reasoning.
"""

import re
import smtplib
import unicodedata
from email.message import EmailMessage

from app.config import Settings
from app.logging_config import get_logger

log = get_logger(__name__)

# Base64 turns 3 bytes into 4 characters. Checking the raw file against the
# ceiling would pass books the mail server then refuses — the exact failure
# the check exists to prevent, reached by a different route.
BASE64_OVERHEAD = 4 / 3

# Room for headers, the body, and MIME boundaries on top of the attachment.
_ENVELOPE_ALLOWANCE_BYTES = 8 * 1024

# Path separators and control characters must not reach a filename, and a
# Kindle showing a name full of them would be a poor outcome regardless.
_UNSAFE_FILENAME = re.compile(r"[\\/\x00-\x1f\x7f]")
_COLLAPSE_WHITESPACE = re.compile(r"\s+")

# Long enough for any real title, short enough to stay clear of filesystem
# and header limits on the receiving end.
MAX_FILENAME_STEM = 120


class SmtpNotConfiguredError(RuntimeError):
    """Raised when delivery is attempted on an instance with no mail account."""


class SendFailedError(RuntimeError):
    """Raised when the mail server refused or could not be reached.

    Carries a message safe to log. The SMTP server's own response text is
    deliberately not propagated to callers — it routinely echoes the username.
    """


def encoded_size(raw_bytes: int) -> int:
    """Approximate the size of `raw_bytes` once base64-encoded into a message."""
    return int(raw_bytes * BASE64_OVERHEAD) + _ENVELOPE_ALLOWANCE_BYTES


def attachment_filename(title: str, author: str, suffix: str = ".epub") -> str:
    """Rebuild a human-readable filename from the book's metadata.

    Stored files are UUID names, deliberately, so that a client-supplied name
    never touches the filesystem. That protection stops at the point of
    sending: a Kindle listing `9f2c1a….epub` is a bad outcome, so the readable
    name is reconstructed here.

    Doing so puts user-controlled text back into a MIME header, hence the
    sanitising. `EmailMessage.add_attachment` handles RFC 2231 encoding of
    whatever survives, so non-ASCII titles are kept rather than stripped.
    """
    stem = f"{title} - {author}".strip(" -")
    # Normalise first: a combining sequence can otherwise survive the filter
    # and render unpredictably on the device.
    stem = unicodedata.normalize("NFC", stem)
    stem = _UNSAFE_FILENAME.sub(" ", stem)
    stem = _COLLAPSE_WHITESPACE.sub(" ", stem).strip(" .")
    stem = stem[:MAX_FILENAME_STEM].strip(" .")

    # A title of nothing but separators sanitises to empty; a nameless
    # attachment is worse than a dull one.
    return f"{stem or 'book'}{suffix}"


def build_message(
    *,
    to_address: str,
    settings: Settings,
    title: str,
    author: str,
    content: bytes,
    filename: str,
) -> EmailMessage:
    message = EmailMessage()
    message["To"] = to_address
    message["From"] = settings.smtp_from
    # Amazon ignores the subject for EPUB; this is for the human who later
    # reads their own sent-mail folder.
    message["Subject"] = title
    # Some servers treat a wholly empty body as suspicious.
    message.set_content(f"{title} by {author}, sent from your libra library.")
    message.add_attachment(
        content,
        maintype="application",
        subtype="epub+zip",
        filename=filename,
    )
    return message


def send_message(message: EmailMessage, settings: Settings) -> None:
    """Hand a message to the configured mail server.

    Injected as a FastAPI dependency so tests replace it wholesale — the suite
    never opens a socket. Failures are re-raised as `SendFailedError` with a
    message safe to show, and the underlying detail is logged rather than
    returned: SMTP rejections routinely quote the username back.
    """
    if not settings.kindle_delivery_configured:
        raise SmtpNotConfiguredError("SMTP is not configured on this instance")

    try:
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        log.error("SMTP authentication failed for user %r: %s", settings.smtp_username, exc)
        raise SendFailedError("The mail server rejected our credentials") from exc
    except (smtplib.SMTPException, OSError) as exc:
        log.error("SMTP delivery failed: %s", exc)
        raise SendFailedError("The mail server could not be reached") from exc


def get_mailer():
    """Dependency returning the send function, so tests can override it."""
    return send_message
