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

if [ "$(id -u)" = "0" ]; then
    # Every file, not only the folder: a new volume takes the folder's owner
    # from the image, while the files in it keep the owner that wrote them.
    find "$DATA_DIR" ! -user libra -exec chown libra:libra {} +
    exec setpriv --reuid=libra --regid=libra --init-groups "$@"
fi

exec "$@"
