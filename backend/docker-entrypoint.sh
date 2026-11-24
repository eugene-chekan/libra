#!/bin/sh
# Starts the container's command as the user `libra`, never as root.
#
# Docker starts this script as root. That is needed once: a data volume made by
# an older image belongs to root, and `libra` could not write the database in
# it. So the script gives the data folder to `libra`, and then gives up root
# for good. The server and everything it starts run as `libra`.
#
# A container started as another user (`docker run --user ...`) cannot change
# who owns the folder. The command runs as that user, as it was asked to.
set -eu

DATA_DIR=/app/data

# With LIBRA_ADMIN_PASSWORD set, the first start makes an admin account called
# LIBRA_ADMIN_USERNAME (default `admin`). A host with no shell into the
# container, such as Railway, needs this to have anybody who can sign in. Once
# any account exists, the command does nothing, so it is safe on every start.
# The arguments are put in front of the command: `setpriv ...` to run it as
# `libra`, or nothing.
create_first_admin() {
    if [ -n "${LIBRA_ADMIN_PASSWORD:-}" ]; then
        "$@" python -m app.cli create-admin --username "${LIBRA_ADMIN_USERNAME:-admin}" --if-missing
    fi
}

if [ "$(id -u)" = "0" ]; then
    # Every file, not only the folder: a new volume takes the folder's owner
    # from the image, while the files in it keep the owner that wrote them.
    find "$DATA_DIR" ! -user libra -exec chown libra:libra {} +
    create_first_admin setpriv --reuid=libra --regid=libra --init-groups
    exec setpriv --reuid=libra --regid=libra --init-groups "$@"
fi

create_first_admin
exec "$@"
