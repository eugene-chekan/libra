"""The address guard on fetching a cover from a link.

Fetching an address somebody typed is server-side request forgery when done
naively: this server sits inside a home network and can reach things the
person asking cannot. See docs/specs/book-covers.md.
"""

import httpx2 as httpx
import pytest

from app.covers_from_url import FetchFailedError, TooLargeError, UnsafeUrlError, check_url, fetch


def test_an_ordinary_public_https_address_is_allowed(monkeypatch) -> None:
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: ["93.184.216.34"])

    assert check_url("https://example.com/cover.jpg") == "example.com"


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("http://example.com/c.jpg", "https"),
        ("ftp://example.com/c.jpg", "https"),
        ("file:///etc/passwd", "https"),
        ("https:///nohost.jpg", "host"),
        ("not a url at all", "https"),
    ],
)
def test_an_address_that_is_not_public_https_is_refused(url: str, reason: str) -> None:
    with pytest.raises(UnsafeUrlError) as caught:
        check_url(url)
    assert reason in str(caught.value)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",  # loopback — this server itself
        "::1",  # loopback, v6
        "192.168.1.1",  # a home router
        "10.0.0.5",  # private
        "172.16.0.1",  # private
        "169.254.169.254",  # link-local: a hosting account's credentials
        "0.0.0.0",  # unspecified
        "224.0.0.1",  # multicast
        "240.0.0.1",  # reserved
        "fc00::1",  # unique-local, v6
        "fe80::1",  # link-local, v6
        "100.64.1.1",  # shared address space (Tailscale, CGNAT): not is_private
        "64:ff9b::7f00:1",  # is_global but reserved; guards against "simplify to is_global"
    ],
)
def test_an_address_inside_the_network_is_refused(monkeypatch, address: str) -> None:
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: [address])

    with pytest.raises(UnsafeUrlError):
        check_url("https://sneaky.example/cover.jpg")


def test_one_bad_address_among_good_ones_refuses_the_whole_name(monkeypatch) -> None:
    """A name may answer with several addresses. Allowing it because one of
    them is public lets the connection land on the other."""
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: ["93.184.216.34", "127.0.0.1"])

    with pytest.raises(UnsafeUrlError):
        check_url("https://sneaky.example/cover.jpg")


def test_a_name_that_resolves_to_nothing_is_refused(monkeypatch) -> None:
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: [])

    with pytest.raises(UnsafeUrlError):
        check_url("https://nowhere.example/cover.jpg")


def test_a_hostname_that_cannot_be_resolved_at_all_is_refused() -> None:
    """The IDNA codec rejects this before any lookup, so it needs no network.

    No monkeypatch: this exercises the real _resolve, whose broad except is the
    only reason a typo like this ends in UnsafeUrlError and not a raw crash.
    """
    with pytest.raises(UnsafeUrlError):
        check_url("https://" + "a" * 64 + ".example/c.jpg")


JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 64


@pytest.fixture(name="allow_any_host")
def allow_any_host_fixture(monkeypatch):
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: ["93.184.216.34"])


def _transport(handler) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


def test_a_picture_is_returned(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(lambda request: httpx.Response(200, content=JPEG)),
    )

    assert fetch("https://example.com/c.jpg", max_bytes=1024) == JPEG


def test_a_redirect_into_a_private_address_is_refused(monkeypatch) -> None:
    """The obvious way past a check that only looks at what was typed."""
    monkeypatch.setattr(
        "app.covers_from_url._resolve",
        lambda host: ["93.184.216.34"] if host == "example.com" else ["127.0.0.1"],
    )
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(
            lambda request: httpx.Response(302, headers={"location": "https://inside/c.jpg"})
        ),
    )

    with pytest.raises(UnsafeUrlError):
        fetch("https://example.com/c.jpg", max_bytes=1024)


def test_a_body_over_the_ceiling_is_refused(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(lambda request: httpx.Response(200, content=JPEG + b"\x00" * 4096)),
    )

    with pytest.raises(TooLargeError):
        fetch("https://example.com/c.jpg", max_bytes=64)


def test_a_server_lying_about_the_content_type_is_refused(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(
            lambda request: httpx.Response(
                200, content=b"<!DOCTYPE html><html>", headers={"content-type": "image/jpeg"}
            )
        ),
    )

    with pytest.raises(FetchFailedError):
        fetch("https://example.com/c.jpg", max_bytes=1024)


def test_a_404_is_refused(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(lambda request: httpx.Response(404)),
    )

    with pytest.raises(FetchFailedError):
        fetch("https://example.com/c.jpg", max_bytes=1024)


def test_too_many_redirects_is_refused(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(
            lambda request: httpx.Response(302, headers={"location": "https://example.com/again"})
        ),
    )

    with pytest.raises(FetchFailedError):
        fetch("https://example.com/c.jpg", max_bytes=1024)
