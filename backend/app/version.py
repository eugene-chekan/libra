"""What this build of libra calls itself."""

from importlib.metadata import version

# Read back from the installed distribution rather than repeated here, so
# `pyproject.toml` stays the one place the number is written. The client has no
# number of its own: `scripts/run.sh` builds it into this wheel, so the two ship
# as one thing and are one thing to name.
VERSION = version("libra-backend")
