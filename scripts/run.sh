#!/usr/bin/env bash
#
# Build libra and serve it on the local network.
#
#   scripts/run.sh              # build and serve on http://<this machine>:8000
#   PORT=9000 scripts/run.sh    # somewhere else
#   scripts/run.sh --skip-web   # reuse the last client build
#   scripts/run.sh --scratch    # throwaway instance, wiped on every run
#
# Real data lives in .run/data and is never touched by --scratch, which uses
# .run/scratch instead. Use --scratch for anything exploratory: demoing,
# verifying a change, clicking through a new screen. Nothing that tests the
# app should be able to damage an installation somebody actually uses.
#
# One process, one origin: the API serves the built client at `/`, so the app
# and its backend always share an address. That is what lets any device on the
# network open it and work — the client asks whichever host served the page,
# rather than a URL fixed when it was compiled. Serving the two separately
# would mean rebuilding the client for every address it might be reached at,
# and listing every device's origin in LIBRA_CORS_ORIGINS.
#
# Runs on Linux and macOS, and on Windows under Git Bash.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$REPO/backend"
CLIENT="$REPO/client"
WEB_OUT="$BACKEND/app/web"
RUNTIME="$REPO/.run"
VENV="$RUNTIME/venv"          # shared; rebuilding it per run buys nothing
PORT="${PORT:-8000}"

SKIP_WEB=0
SCRATCH=0
for arg in "$@"; do
  case "$arg" in
    --skip-web) SKIP_WEB=1 ;;
    --scratch) SCRATCH=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Where the books and the database live.
#
# `--scratch` is the whole point of this split: testing an install must never
# be able to touch a real one. The scratch path is emptied on every run, which
# is safe precisely because nothing but a throwaway instance is ever kept
# there — and it means nobody has to reach for `rm -rf` against the real data
# to get a clean slate. That reach is what destroyed a real account here once.
if [ "$SCRATCH" -eq 1 ]; then
  DATA="$RUNTIME/scratch"
  rm -rf "$DATA"
else
  DATA="$RUNTIME/data"
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# Paths handed to Python, rather than used by the shell.
#
# Under Git Bash this script's paths are POSIX (`/c/Users/...`), which the shell
# understands and a Windows Python does not — it reports only "unable to open
# database file", naming nothing. `cygpath -m` gives `C:/Users/...`, which both
# accept. A no-op everywhere else.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

command -v uv >/dev/null || die "uv is not installed — see https://docs.astral.sh/uv/"

# ---------------------------------------------------------------- the client
if [ "$SKIP_WEB" -eq 0 ]; then
  command -v flutter >/dev/null \
    || die "flutter is not on PATH. Add it, or pass --skip-web to reuse the last build."

  step "Building the client"
  # --no-web-resources-cdn is not a nicety. It defaults to *on*, and with it on
  # the generated loader fetches CanvasKit — the Skia build that paints every
  # pixel of this UI — from gstatic.com at each cold load, while the complete
  # copy it just built sits unused in the output. An instance with no internet
  # then serves the page and renders nothing at all: a blank canvas on a home
  # server, an air-gapped install, a laptop on a train. The fonts are already
  # bundled for exactly this reason; shipping them locally and then borrowing
  # the renderer from Google would leave the local-first claim half true.
  (cd "$CLIENT" && flutter build web --release --no-web-resources-cdn)

  # Replaced wholesale rather than merged: a stale hashed asset left behind by
  # an earlier build is served happily and is very hard to recognise later.
  rm -rf "$WEB_OUT"
  mkdir -p "$WEB_OUT"
  cp -R "$CLIENT/build/web/." "$WEB_OUT/"
  # Flutter's own build bookkeeping, meaningless once copied and not something
  # to ship inside a wheel.
  rm -f "$WEB_OUT/.last_build_id"
elif [ ! -d "$WEB_OUT" ]; then
  die "--skip-web was passed but $WEB_OUT does not exist; run once without it."
fi

# ------------------------------------------------------------------ the wheel
step "Building the wheel"
rm -rf "$BACKEND/dist"
(cd "$BACKEND" && uv build --wheel --out-dir dist >/dev/null)
WHEEL="$(ls "$BACKEND"/dist/*.whl | head -n 1)"
[ -n "$WHEEL" ] || die "uv build produced no wheel"
echo "    $(basename "$WHEEL")"

# ---------------------------------------------------------------- the install
# Installed into a throwaway venv from the wheel, not run from the source tree.
# That is the point of building one: what runs here is what a deployment would
# get, so a file missing from the wheel fails now rather than on someone else's
# machine.
step "Installing"
venv_python() {
  if [ -x "$VENV/bin/python" ]; then printf '%s' "$VENV/bin/python"
  elif [ -x "$VENV/Scripts/python.exe" ]; then printf '%s' "$VENV/Scripts/python.exe"
  fi
}
# Created only when missing: this script is meant to be run on every boot, and
# `uv venv` treats an existing environment as an error rather than a no-op.
[ -n "$(venv_python)" ] || uv venv --quiet "$VENV"
VENV_PY="$(venv_python)"
[ -n "$VENV_PY" ] || die "could not find the interpreter in $VENV"

# --reinstall so a rebuilt wheel of the same version actually replaces the
# installed one; pip would otherwise see 0.1.0 already present and do nothing,
# and every run would serve the first build forever.
uv pip install --quiet --python "$VENV_PY" --reinstall "$WHEEL"

# ------------------------------------------------------------------- the data
# Kept out of the source tree and out of the venv, so rebuilding either never
# touches the books.
mkdir -p "$DATA"
DATA_NATIVE="$(native_path "$DATA")"
export LIBRA_DATABASE_URL="${LIBRA_DATABASE_URL:-sqlite:///$DATA_NATIVE/libra.db}"
export LIBRA_LIBRARY_DIR="${LIBRA_LIBRARY_DIR:-$DATA_NATIVE/library}"

step "Preparing the database"
# Idempotent: applies what is pending and creates an account only when the
# installation has none, so this is safe on every boot rather than only the
# first. Without it a fresh clone starts, shows a login screen, and has no
# account to sign in with.
"$VENV_PY" -m app.cli create-admin \
  --username "${LIBRA_ADMIN_USERNAME:-admin}" --if-missing

# Who to sign in as, on every run rather than only the one that created the
# account. Otherwise the answer is a line of output from whenever the install
# was first set up, which nobody still has. Names only — passwords are stored
# as Argon2 hashes and cannot be recovered from here, only reset.
ACCOUNTS="$(
  "$VENV_PY" - <<'PY' 2>/dev/null || true
from sqlmodel import Session, select

from app.db import get_engine
from app.models import User

with Session(get_engine()) as session:
    users = session.exec(select(User).order_by(User.id)).all()
print(", ".join(f"{u.username}{' (admin)' if u.is_admin else ''}" for u in users))
PY
)"

# ------------------------------------------------------------------ the serve
# 0.0.0.0 rather than 127.0.0.1 is what actually exposes this to the network.
step "Serving"
LAN_IP="$(
  "$VENV_PY" - <<'PY' 2>/dev/null || true
import socket

# Connecting a UDP socket assigns a local address without sending anything,
# which is the portable way to ask "which of my interfaces reaches the LAN?".
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("192.168.1.1", 1))
    print(s.getsockname()[0])
except OSError:
    pass
finally:
    s.close()
PY
)"

echo
if [ "$SCRATCH" -eq 1 ]; then
  echo "    scratch        this instance is wiped on every run"
fi
echo "    this machine   http://localhost:$PORT"
if [ -n "$LAN_IP" ]; then echo "    other devices  http://$LAN_IP:$PORT"; fi
if [ -n "$ACCOUNTS" ]; then echo "    sign in as     $ACCOUNTS"; fi
echo "    books          $LIBRA_LIBRARY_DIR"
echo
echo "    Ctrl-C to stop."
echo

exec "$VENV_PY" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
