#!/usr/bin/env bash
#
# Serve libra on the experiment database, to browse the 40 test books.
#
#   experiment/serve.sh              # build the client, serve on port 8001
#   experiment/serve.sh --skip-web   # reuse the last client build
#   PORT=9001 experiment/serve.sh    # another port
#
# It runs the source with backend/.venv, not the install in .run/venv, so it
# can run next to the real install on port 8000. experiment/serve.ps1 is the
# same script for PowerShell 7+; a change to either belongs in both.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT="$REPO/web"
WEB_OUT="$REPO/backend/app/web"
PORT="${PORT:-8001}"

SKIP_WEB=0
for arg in "$@"; do
  case "$arg" in
    --skip-web) SKIP_WEB=1 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

die() { printf '\n\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

[ -f "$REPO/.run/experiment/libra.db" ] ||
  die 'no experiment database; see "The database" in experiment/README.md'

if [ "$SKIP_WEB" -eq 0 ]; then
  [ -d "$CLIENT/node_modules" ] || (cd "$CLIENT" && npm ci)
  (cd "$CLIENT" && npm run build)
  rm -rf "$WEB_OUT"
  mkdir -p "$WEB_OUT"
  cp -R "$CLIENT/dist/." "$WEB_OUT/"
elif [ ! -f "$WEB_OUT/index.html" ]; then
  die "--skip-web was passed but there is no client build; run once without it."
fi

cd "$REPO/backend"
export LIBRA_DATABASE_URL="sqlite:///../.run/experiment/libra.db"
export LIBRA_LIBRARY_DIR="../.run/experiment/library"

uv run python -m app.cli create-admin --username admin --if-missing

echo
echo "    this machine   http://localhost:$PORT"
echo "    sign in as     admin"
if [ -f "$REPO/.run/experiment/admin.env" ]; then
  echo "    password       in .run/experiment/admin.env"
fi
echo "    Ctrl-C to stop."
echo

exec uv run uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
