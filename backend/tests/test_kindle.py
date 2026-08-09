"""Sending a book to a Kindle.

Every precondition test asserts the mailbox stayed empty, not just that a
status code came back: a check that returns the right error while still
mailing the file has failed at the only thing it was for.
"""

from email.message import EmailMessage
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.mailer import (
    SendFailedError,
    encoded_size,
    get_mailer,
    send_message,
)
from app.models import User, UserBookState
from tests.conftest import SMTP_PASSWORD
from tests.epub_factory import epub_bytes

KINDLE_ADDRESS = "reader_123@kindle.com"


@pytest.fixture(name="kindle_user")
def kindle_user_fixture(session: Session, user: User) -> User:
    user.kindle_email = KINDLE_ADDRESS
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _upload(client: TestClient, tmp_path: Path, **kwargs) -> int:
    body = epub_bytes(tmp_path, **kwargs)
    return client.post(
        "/books/upload", files={"file": ("dune.epub", body, "application/epub+zip")}
    ).json()["id"]


def test_sending_hands_the_book_to_the_mail_server(
    kindle_client: TestClient, kindle_user: User, tmp_path: Path, mailbox: list
) -> None:
    book_id = _upload(kindle_client, tmp_path)

    response = kindle_client.post(f"/books/{book_id}/send-to-kindle")

    # 202, not 200: handing it over is the last thing we can observe.
    assert response.status_code == 202
    assert response.json()["sent_to"] == KINDLE_ADDRESS
    assert response.json()["attempted_at"] is not None
    assert len(mailbox) == 1


def test_the_message_is_addressed_and_attached_correctly(
    kindle_client: TestClient, kindle_user: User, tmp_path: Path, mailbox: list
) -> None:
    book_id = _upload(kindle_client, tmp_path)
    kindle_client.post(f"/books/{book_id}/send-to-kindle")

    message = mailbox[0]
    assert message["To"] == KINDLE_ADDRESS
    assert message["From"] == "libra@example.test"
    assert message["Subject"] == "Dune"

    attachment = next(part for part in message.iter_attachments())
    assert attachment.get_content_type() == "application/epub+zip"
    # Rebuilt from metadata: the stored file is a UUID, which would be a poor
    # thing to show in a Kindle library.
    assert attachment.get_filename() == "Dune - Frank Herbert.epub"


def test_a_send_records_when_it_was_attempted(
    kindle_client: TestClient, kindle_user: User, tmp_path: Path, session: Session
) -> None:
    book_id = _upload(kindle_client, tmp_path)

    kindle_client.post(f"/books/{book_id}/send-to-kindle")

    state = session.get(UserBookState, (kindle_user.id, book_id))
    assert state is not None and state.last_sent_at is not None


# --- preconditions, none of which may send -------------------------------


def test_without_a_kindle_address_nothing_is_sent(
    kindle_client: TestClient, user: User, tmp_path: Path, mailbox: list
) -> None:
    """`user` deliberately has no kindle_email."""
    book_id = _upload(kindle_client, tmp_path)

    response = kindle_client.post(f"/books/{book_id}/send-to-kindle")

    assert response.status_code == 422
    assert mailbox == []


def test_an_unknown_book_is_404_and_sends_nothing(
    kindle_client: TestClient, kindle_user: User, mailbox: list
) -> None:
    assert kindle_client.post("/books/999/send-to-kindle").status_code == 404
    assert mailbox == []


def test_delivery_is_503_when_smtp_is_unconfigured(
    client: TestClient, kindle_user: User, tmp_path: Path
) -> None:
    """`client` uses the default settings, which configure no mail account —
    the state a deployment that never set LIBRA_SMTP_* is in."""
    book_id = _upload(client, tmp_path)

    response = client.post(f"/books/{book_id}/send-to-kindle")

    assert response.status_code == 503


def test_an_oversized_book_is_refused_and_not_sent(
    kindle_client: TestClient,
    kindle_user: User,
    tmp_path: Path,
    smtp_settings,
    mailbox: list,
) -> None:
    """Checked against the *encoded* size. A file comfortably under the raw
    ceiling can still exceed it once base64 inflates it by a third, and the
    mail server would then refuse what we accepted."""
    book_id = _upload(kindle_client, tmp_path)
    # Just under the raw limit, comfortably over it once encoded.
    smtp_settings.kindle_max_attachment_bytes = 1_000

    response = kindle_client.post(f"/books/{book_id}/send-to-kindle")

    assert response.status_code == 413
    assert mailbox == []


@pytest.mark.parametrize("megabytes", [1, 10, 45])
def test_encoded_size_accounts_for_base64_inflation(megabytes: int) -> None:
    """The arithmetic the ceiling depends on, tested directly.

    Base64 turns 3 bytes into 4, so a 45 MB book is ~60 MB on the wire and
    Amazon refuses it despite the file being under a 50 MB reading of the
    limit. Checked at sizes where the fixed envelope allowance is noise —
    an earlier version of this test used a few-kilobyte EPUB, where the 8 KB
    allowance alone kept it over any ceiling, so it passed happily with the
    base64 factor removed entirely and proved nothing.
    """
    raw = megabytes * 1024 * 1024

    assert encoded_size(raw) >= raw * 1.3


def test_a_file_under_the_raw_limit_but_over_it_encoded_is_refused(
    kindle_client: TestClient,
    kindle_user: User,
    tmp_path: Path,
    smtp_settings,
    mailbox: list,
) -> None:
    """The same rule reaching the endpoint.

    The ceiling sits above the file's raw size and below its encoded size, so
    a raw-size check would accept this book and an encoded-size check refuses
    it. `padding` makes the file big enough that base64 inflation, not the
    fixed envelope allowance, is what carries it over.
    """
    body = epub_bytes(tmp_path, description="x" * 200_000)
    book_id = kindle_client.post(
        "/books/upload", files={"file": ("d.epub", body, "application/epub+zip")}
    ).json()["id"]

    raw = len(body)
    # The gap must come from base64, not the envelope allowance.
    assert encoded_size(raw) - raw > 20_000
    smtp_settings.kindle_max_attachment_bytes = raw + 10_000

    assert kindle_client.post(f"/books/{book_id}/send-to-kindle").status_code == 413
    assert mailbox == []


# --- secrets -------------------------------------------------------------


def test_no_response_carries_the_smtp_password(
    kindle_client: TestClient, kindle_user: User, tmp_path: Path
) -> None:
    """The leak that arrives later via a well-meaning 'include the underlying
    error' change. Asserted across every reachable path, not just the happy
    one."""
    book_id = _upload(kindle_client, tmp_path)

    responses = [
        kindle_client.post(f"/books/{book_id}/send-to-kindle"),
        kindle_client.post("/books/999/send-to-kindle"),
        kindle_client.get("/auth/me"),
    ]

    for response in responses:
        assert SMTP_PASSWORD not in response.text
        assert "smtp_password" not in response.text


def test_an_smtp_rejection_does_not_leak_the_password(
    smtp_settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The path where the leak would actually happen.

    The injected test mailer never fails, so the endpoint tests above cannot
    reach this branch at all — an earlier version of this file asserted the
    password was absent only from paths that never touch SMTP, and passed
    happily with the password interpolated into the error message.
    """
    import smtplib

    class ExplodingSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            pass

        def login(self, username, password):
            # Real servers echo the account name back in the rejection.
            raise smtplib.SMTPAuthenticationError(
                535, f"5.7.8 Username and Password not accepted for {username}".encode()
            )

    monkeypatch.setattr(smtplib, "SMTP", ExplodingSMTP)

    with pytest.raises(SendFailedError) as caught:
        send_message(EmailMessage(), smtp_settings)

    assert SMTP_PASSWORD not in str(caught.value)
    assert smtp_settings.smtp_username not in str(caught.value)


def test_a_failed_send_is_502_and_records_nothing(
    session: Session, smtp_settings, kindle_user: User, tmp_path: Path
) -> None:
    """Same never-lie-about-state discipline the upload router follows: a
    send that failed must not leave a record claiming the book went out."""

    def failing_mailer():
        def send(message, settings):
            raise SendFailedError("The mail server could not be reached")

        return send

    from tests.conftest import _build_client

    clients = _build_client(
        session, smtp_settings, kindle_user, extra_overrides={get_mailer: failing_mailer}
    )
    client = next(clients)

    book_id = _upload(client, tmp_path)
    response = client.post(f"/books/{book_id}/send-to-kindle")

    assert response.status_code == 502
    assert SMTP_PASSWORD not in response.text
    state = session.get(UserBookState, (kindle_user.id, book_id))
    assert state is None or state.last_sent_at is None


def test_me_exposes_the_sender_address_to_approve(
    kindle_client: TestClient, kindle_user: User
) -> None:
    """Not a secret — it is the string users must copy into Amazon's approved
    sender list, and delivery silently fails until they do."""
    body = kindle_client.get("/auth/me").json()

    assert body["kindle_sender"] == "libra@example.test"


def test_me_reports_no_sender_when_delivery_is_unconfigured(client: TestClient, user: User) -> None:
    assert client.get("/auth/me").json()["kindle_sender"] is None


# --- isolation -----------------------------------------------------------


def test_a_send_records_against_only_the_sender(
    kindle_client: TestClient, kindle_user: User, other_user: User, tmp_path: Path, session: Session
) -> None:
    book_id = _upload(kindle_client, tmp_path)

    kindle_client.post(f"/books/{book_id}/send-to-kindle")

    assert session.get(UserBookState, (other_user.id, book_id)) is None


# Filename sanitising moved to tests/test_naming.py alongside the function.
