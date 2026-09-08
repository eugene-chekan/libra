"""Fetching a cover from a link, without letting the server be used as a proxy.

The server sits inside a home network. `http://192.168.1.1` is a router's admin
page, `http://localhost:8000` is this application, and on a rented server
`http://169.254.169.254` is the hosting account's credentials. An address
somebody typed is checked before anything connects to it.
"""

import ipaddress
import socket
import time
from urllib.parse import urlparse

import httpx2 as httpx

from app.covers import SNIFF_BYTES, sniff_media_type


class UnsafeUrlError(ValueError):
    """The address is refused, and will not be fetched."""


def _resolve(host: str) -> list[str]:
    """Every address this name answers with. Split out so tests can replace it."""
    try:
        return [info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)]
    except (OSError, ValueError):
        # gaierror/herror are OSError; a hostname the IDNA codec rejects raises
        # UnicodeEncodeError, a ValueError. An empty list means refusal.
        return []


def _is_public(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    return not (
        parsed.is_private
        or parsed.is_loopback
        or parsed.is_link_local
        or parsed.is_multicast
        or parsed.is_reserved
        or parsed.is_unspecified
        # Catches 100.64.0.0/10 (shared address space: Tailscale, CGNAT), which
        # ipaddress keeps out of is_private. Kept alongside the clauses above,
        # not in place of them: multicast and reserved v6 still report is_global.
        or not parsed.is_global
    )


def check_url(url: str) -> str:
    """Refuse an address that is not a public https one; returns its hostname.

    Args:
        url: The address as it was typed.

    Returns:
        The hostname, once every address it resolves to has been accepted.

    Raises:
        UnsafeUrlError: Wrong scheme, no host, or an address inside a network
            this server can reach and the caller should not.
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise UnsafeUrlError("a cover link must be an https address")
    if not parsed.hostname:
        raise UnsafeUrlError("that address names no host")

    addresses = _resolve(parsed.hostname)
    if not addresses:
        raise UnsafeUrlError("that address does not resolve")

    # Every address, not the first: a name may answer with several, and
    # allowing it because one is public lets the connection land on another.
    if not all(_is_public(address) for address in addresses):
        raise UnsafeUrlError("that address is inside a private network")

    return parsed.hostname


MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 10.0


class FetchFailedError(Exception):
    """The address was allowed, but nothing usable came back."""


class TooLargeError(FetchFailedError):
    """The picture is over the ceiling."""


def _transport() -> httpx.BaseTransport | None:
    """The transport to fetch through. Replaced in tests; None means the real one."""
    return None


def fetch(url: str, max_bytes: int) -> bytes:
    """Download a picture from a public https address.

    Redirects are followed by hand so that every hop is checked. Following them
    automatically would let a permitted host redirect into a private address.

    Args:
        url: The address as it was typed.
        max_bytes: Ceiling, counted on the raw wire bytes rather than trusted
            from a header.

    Returns:
        The picture's bytes.

    Raises:
        UnsafeUrlError: An address that must not be fetched, at any hop.
        TooLargeError: The body went over the ceiling.
        FetchFailedError: No usable picture came back, or the whole fetch ran
            past TIMEOUT_SECONDS.
    """
    # A trailing newline or a leading space off a copy-paste is the likeliest
    # bad input. urlparse tolerates it; httpx.URL does not.
    url = url.strip()
    # One wall-clock budget for the whole call. httpx's read timeout is per
    # socket read and every successful read resets it, so a server dripping one
    # byte at a time never trips it. This does.
    deadline = time.monotonic() + TIMEOUT_SECONDS

    client_args = {
        "timeout": TIMEOUT_SECONDS,
        "follow_redirects": False,
        # No proxy, no env certs. In Docker HTTPS_PROXY/ALL_PROXY are often set,
        # and a proxy would resolve the host itself, so check_url would have
        # vetted an address the socket never used.
        "trust_env": False,
    }
    transport = _transport()
    if transport is not None:
        client_args["transport"] = transport

    with httpx.Client(**client_args) as client:
        for _ in range(MAX_REDIRECTS + 1):
            check_url(url)
            if time.monotonic() > deadline:
                raise FetchFailedError("that address took too long to answer")
            try:
                with client.stream(
                    "GET",
                    url,
                    headers={"accept": "image/*", "accept-encoding": "identity"},
                ) as response:
                    # The client keeps a cookie jar and fills it from every
                    # response. Empty it so nothing a hop set rides to the next.
                    client.cookies.clear()
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise FetchFailedError("a redirect with nowhere to go")
                        url = str(response.url.join(location))
                        continue
                    if response.status_code != 200:
                        raise FetchFailedError(f"the server answered {response.status_code}")
                    return _read_capped(response, max_bytes, deadline)
            except httpx.HTTPError as exc:
                raise FetchFailedError(f"could not reach that address: {exc}") from exc
            except (httpx.InvalidURL, ValueError) as exc:
                # httpx.InvalidURL is a bare Exception, and building the request
                # can raise ValueError for a control byte urlparse let through.
                # check_url ran outside this try, so its UnsafeUrlError (itself a
                # ValueError) is never caught here.
                raise FetchFailedError(f"that address cannot be fetched: {exc}") from exc

    raise FetchFailedError("too many redirects")


def _read_capped(response: httpx.Response, max_bytes: int, deadline: float) -> bytes:
    """Read the body, stopping at the ceiling, and check it really is a picture.

    Args:
        response: The open streaming response.
        max_bytes: Ceiling, counted on the raw wire bytes. `iter_raw` is used,
            not `iter_bytes`, so a `Content-Encoding: gzip` reply cannot
            decompress each read into memory before the ceiling is tested.
        deadline: A `time.monotonic()` value. Reading past it fails the fetch,
            so a slow drip cannot pin the worker.

    Returns:
        The picture's bytes.

    Raises:
        TooLargeError: The wire body went over the ceiling.
        FetchFailedError: The deadline passed, or the bytes are not a picture.
    """
    body = bytearray()
    for chunk in response.iter_raw():
        if time.monotonic() > deadline:
            raise FetchFailedError("that address took too long to send the picture")
        body.extend(chunk)
        if len(body) > max_bytes:
            raise TooLargeError(f"that picture is over {max_bytes} bytes")

    if sniff_media_type(bytes(body[:SNIFF_BYTES])) is None:
        # The header said what it liked; the bytes are the evidence.
        raise FetchFailedError("that link is not a JPEG, PNG, GIF or WebP")
    return bytes(body)
