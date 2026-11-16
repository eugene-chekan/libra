"""Build demo.db from schema.sql and test-data.sql.

Run it from any folder. The three files must be in one folder:

    python make_demo_db.py

It writes demo.db next to itself, and replaces an old demo.db. It needs
Python 3 and nothing else.
"""

import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).parent
SCRIPTS = ("schema.sql", "test-data.sql")
DATABASE = HERE / "demo.db"


def main():
    """Create the database, load both scripts, and report what is in it."""
    missing = [name for name in SCRIPTS if not (HERE / name).exists()]
    if missing:
        sys.exit(f"Not found next to this script: {', '.join(missing)}")
    DATABASE.unlink(missing_ok=True)
    connection = sqlite3.connect(DATABASE)
    for name in SCRIPTS:
        connection.executescript((HERE / name).read_text(encoding="utf-8"))
    broken = connection.execute("PRAGMA foreign_key_check").fetchall()
    tables = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'chunk_fts_%' ORDER BY name"
        )
    ]
    print(f"wrote {DATABASE}")
    for table in tables:
        count = connection.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
        print(f"  {table}: {count} rows")
    connection.close()
    if broken:
        sys.exit(f"Rows that break a foreign key: {broken}")
    print("No row breaks a foreign key.")


if __name__ == "__main__":
    main()
