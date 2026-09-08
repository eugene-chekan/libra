"""The address guard on fetching a cover from a link.

Fetching an address somebody typed is server-side request forgery when done
naively: this server sits inside a home network and can reach things the
person asking cannot. See docs/specs/book-covers.md.
"""

import gzip
import time

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


class _ChunkStream(httpx.SyncByteStream):
    """A response body handed over in separate network-sized reads.

    `httpx.Response(content=...)` reads the whole body at build time, so a test
    written that way never exercises the streaming loop in `_read_capped`. This
    stream yields one chunk at a time and records how many were actually pulled,
    so a test can prove the reader stopped before the last one.
    """

    def __init__(self, *chunks: bytes) -> None:
        self._chunks = chunks
        self.produced = 0

    def __iter__(self):
        for chunk in self._chunks:
            self.produced += 1
            yield chunk

    def close(self) -> None:
        pass


def _serves(*, headers: dict | None = None, body: bytes = JPEG):
    """A `_transport` replacement that streams a 200 with `body`, in one chunk."""
    return lambda: _transport(
        lambda request: httpx.Response(200, stream=_ChunkStream(body), headers=headers or {})
    )


def test_a_picture_is_returned(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr("app.covers_from_url._transport", _serves())

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


def test_a_typed_private_address_raises_unsafe_not_fetch_failed(monkeypatch) -> None:
    """`check_url` runs outside the widened `except (httpx.InvalidURL, ValueError)`.

    `UnsafeUrlError` is itself a `ValueError`, so if the catch ever moved to
    wrap `check_url` this refusal would come back as a plain `FetchFailedError`.
    """
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: ["127.0.0.1"])

    with pytest.raises(UnsafeUrlError):
        fetch("https://example.com/c.jpg", max_bytes=1024)


def test_the_ceiling_is_tested_on_the_stream_not_after_it(monkeypatch, allow_any_host) -> None:
    """I3: reading stops the moment the running total passes the ceiling, before
    the rest of the body is pulled off the wire."""
    stream = _ChunkStream(JPEG, b"\x00" * 4096, b"\x00" * 4096, b"\x00" * 4096)
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(lambda request: httpx.Response(200, stream=stream)),
    )

    with pytest.raises(TooLargeError):
        fetch("https://example.com/c.jpg", max_bytes=2048)

    assert stream.produced == 2  # JPEG (under), then one 4096 chunk (over) — stopped


def test_a_lying_content_length_is_ignored(monkeypatch, allow_any_host) -> None:
    """I3: a small `Content-Length` does not lift the ceiling; the body does.

    Guards the "counted on the stream, never trusted from a header" rule: an
    implementation that read `Content-Length` would let this 8 KB body through.
    """
    body = JPEG + b"\x00" * 8192
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        _serves(headers={"content-length": "3"}, body=body),
    )

    with pytest.raises(TooLargeError):
        fetch("https://example.com/c.jpg", max_bytes=1024)


def test_a_gzip_bomb_is_refused(monkeypatch, allow_any_host) -> None:
    """C1: the ceiling counts raw wire bytes, so a reply that claims
    `Content-Encoding: gzip` and unzips to many megabytes is never decompressed
    into memory. Its raw bytes are small, slip under the ceiling, and then fail
    the picture sniff — a clean `FetchFailedError`, not `TooLargeError`."""
    decompressed = b"\x00" * (16 * 1024 * 1024)
    bomb = gzip.compress(decompressed)
    ceiling = 64 * 1024
    assert len(bomb) < ceiling < len(decompressed)

    monkeypatch.setattr(
        "app.covers_from_url._transport",
        _serves(headers={"content-encoding": "gzip"}, body=bomb),
    )

    with pytest.raises(FetchFailedError) as caught:
        fetch("https://example.com/c.jpg", max_bytes=ceiling)
    assert not isinstance(caught.value, TooLargeError)


def test_a_slow_drip_server_cannot_outlast_the_deadline(monkeypatch, allow_any_host) -> None:
    """I1: httpx resets its read timer on every chunk, so a server trickling a
    few bytes at a time never trips it. The wall-clock deadline does not reset,
    so the read is cut off once the whole call has run past `TIMEOUT_SECONDS`."""
    monkeypatch.setattr("app.covers_from_url.TIMEOUT_SECONDS", 0.15)

    class _DripStream(httpx.SyncByteStream):
        def __iter__(self):
            for _ in range(50):
                time.sleep(0.1)
                yield b"\x00" * 8

        def close(self) -> None:
            pass

    monkeypatch.setattr(
        "app.covers_from_url._transport",
        lambda: _transport(lambda request: httpx.Response(200, stream=_DripStream())),
    )

    with pytest.raises(FetchFailedError, match="too long to send the picture"):
        fetch("https://example.com/c.jpg", max_bytes=10 * 1024 * 1024)


def test_a_server_lying_about_the_content_type_is_refused(monkeypatch, allow_any_host) -> None:
    monkeypatch.setattr(
        "app.covers_from_url._transport",
        _serves(headers={"content-type": "image/jpeg"}, body=b"<!DOCTYPE html><html>"),
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


@pytest.mark.parametrize(
    "pasted",
    [
        "https://example.com/c.jpg\n",  # trailing newline off a copy-paste
        "https://example.com/c.jpg\r\n",  # trailing CRLF
        " https://example.com/c.jpg",  # leading space
    ],
)
def test_a_pasted_url_with_edge_whitespace_still_fetches(
    monkeypatch, allow_any_host, pasted: str
) -> None:
    """I2: `urlparse` tolerates this and `check_url` passes, but `httpx.URL`
    rejects it. `fetch` strips the ends first, so the common paste artifact just
    works instead of raising an undocumented exception."""
    monkeypatch.setattr("app.covers_from_url._transport", _serves())

    assert fetch(pasted, max_bytes=1024) == JPEG


def test_a_url_with_an_interior_control_byte_fails_as_fetch_failed(
    monkeypatch, allow_any_host
) -> None:
    """I2: `strip()` cannot clean a byte in the middle. `check_url` still passes
    it, then `httpx.URL` raises `httpx.InvalidURL` (a bare `Exception`). The
    widened catch must turn that into the documented `FetchFailedError`."""
    monkeypatch.setattr("app.covers_from_url._transport", _serves())

    with pytest.raises(FetchFailedError):
        fetch("https://example.com/c\x00.jpg", max_bytes=1024)
