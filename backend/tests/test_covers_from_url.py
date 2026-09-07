"""The address guard on fetching a cover from a link.

Fetching an address somebody typed is server-side request forgery when done
naively: this server sits inside a home network and can reach things the
person asking cannot. See docs/specs/book-covers.md.
"""

import pytest

from app.covers_from_url import UnsafeUrlError, check_url


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
