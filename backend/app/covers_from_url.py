"""Fetching a cover from a link, without letting the server be used as a proxy.

The server sits inside a home network. `http://192.168.1.1` is a router's admin
page, `http://localhost:8000` is this application, and on a rented server
`http://169.254.169.254` is the hosting account's credentials. An address
somebody typed is checked before anything connects to it.
"""

import ipaddress
import socket
from urllib.parse import urlparse


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
