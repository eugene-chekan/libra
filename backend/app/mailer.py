"""Message construction and SMTP transport.

Split from the delivery logic so tests can replace `send_message` without a
mail server, and so the part that is easy to get subtly wrong — the encoded
size — sits in one place with its reasoning.

The attachment filename used to live here too. It moved to `app.naming` once
the download endpoint needed the same sanitising for a `Content-Disposition`
header: a second caller in a different domain is what takes a helper out of
the module that first needed it.
"""

import smtplib
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
