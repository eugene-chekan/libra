"""Draw the two database diagrams of database.md as SVG files.

Run from the repository root, then convert each SVG to PNG with ImageMagick:

    python docs/db/diagrams/schema.py
    magick -density 150 docs/db/diagrams/blocks.svg docs/db/diagrams/blocks.png
    magick -density 150 docs/db/diagrams/er.svg docs/db/diagrams/er.png

`blocks.svg` is the logical schema: the tables in their five blocks.
`er.svg` is the ER diagram: the same tables with every column.

TABLES repeats docs/db/schema.sql by hand. Change it after a migration.
"""

from pathlib import Path

HERE = Path(__file__).parent
FONT = "Arial"

# block: (title, header fill, group fill, stroke)
BLOCKS = {
    "acc": ("Accounts", "#dbeafe", "#eff6ff", "#1d4ed8"),
    "cat": ("Catalogue: shared", "#dcfce7", "#f0fdf4", "#15803d"),
    "read": ("Reading: one reader's rows", "#fef3c7", "#fffbeb", "#b45309"),
    "chat": ("Librarian: chat", "#f3e8ff", "#faf5ff", "#7e22ce"),
    "idx": ("Librarian: search index", "#ffe4e6", "#fff1f2", "#be123c"),
}

# table: (block, [(column, type, key, may be empty)])
TABLES = {
    "user": (
        "acc",
        [
            ("id", "INTEGER", "PK", False),
            ("username", "VARCHAR", "UK", False),
            ("password_hash", "VARCHAR", "", False),
            ("is_admin", "BOOLEAN", "", False),
            ("kindle_email", "VARCHAR", "", True),
            ("created_at", "DATETIME", "", False),
        ],
    ),
    "user_session": (
        "acc",
        [
            ("token_hash", "VARCHAR", "PK", False),
            ("user_id", "INTEGER", "FK", False),
            ("kind", "VARCHAR", "", False),
            ("expires_at", "DATETIME", "", False),
            ("created_at", "DATETIME", "", False),
        ],
    ),
    "conversation": (
        "chat",
        [
            ("id", "INTEGER", "PK", False),
            ("user_id", "INTEGER", "FK", False),
            ("title", "VARCHAR", "", True),
            ("created_at", "DATETIME", "", False),
        ],
    ),
    "message": (
        "chat",
        [
            ("id", "INTEGER", "PK", False),
            ("conversation_id", "INTEGER", "FK", False),
            ("role", "VARCHAR", "", False),
            ("content", "VARCHAR", "", False),
            ("created_at", "DATETIME", "", False),
            ("meta", "JSON", "", True),
        ],
    ),
    "shelf": (
        "read",
        [
            ("id", "INTEGER", "PK", False),
            ("owner_id", "INTEGER", "FK", False),
            ("name", "VARCHAR", "", False),
            ("name_folded", "VARCHAR", "UK", False),
            ("position", "INTEGER", "", False),
            ("visibility", "VARCHAR", "", False),
            ("created_at", "DATETIME", "", False),
        ],
    ),
    "user_book_state": (
        "read",
        [
            ("user_id", "INTEGER", "PK FK", False),
            ("book_id", "INTEGER", "PK FK", False),
            ("shelf_id", "INTEGER", "FK", True),
            ("rating", "INTEGER", "", False),
            ("progress", "FLOAT", "", False),
            ("position", "VARCHAR", "", True),
            ("started_at", "DATETIME", "", True),
            ("finished_at", "DATETIME", "", True),
            ("last_sent_at", "DATETIME", "", True),
            ("updated_at", "DATETIME", "", False),
        ],
    ),
    "note": (
        "read",
        [
            ("id", "INTEGER", "PK", False),
            ("user_id", "INTEGER", "FK", False),
            ("book_id", "INTEGER", "FK", False),
            ("text", "VARCHAR", "", False),
            ("page", "INTEGER", "", True),
            ("created_at", "DATETIME", "", False),
        ],
    ),
    "book": (
        "cat",
        [
            ("id", "INTEGER", "PK", False),
            ("title", "VARCHAR", "", False),
            ("author", "VARCHAR", "", False),
            ("format", "VARCHAR", "", False),
            ("file_path", "VARCHAR", "", False),
            ("year", "INTEGER", "", True),
            ("blurb", "VARCHAR", "", True),
            ("pages", "INTEGER", "", True),
            ("uploaded_by", "INTEGER", "FK", True),
            ("book_metadata", "JSON", "", True),
        ],
    ),
    "book_tag": (
        "cat",
        [
            ("book_id", "INTEGER", "PK FK", False),
            ("tag_id", "INTEGER", "PK FK", False),
        ],
    ),
    "tag": (
        "cat",
        [
            ("id", "INTEGER", "PK", False),
            ("owner_id", "INTEGER", "FK", True),
            ("name", "VARCHAR", "", False),
            ("name_folded", "VARCHAR", "UK", False),
            ("created_at", "DATETIME", "", False),
        ],
    ),
    "chunk": (
        "idx",
        [
            ("id", "INTEGER", "PK", False),
            ("book_id", "INTEGER", "FK", False),
            ("position", "INTEGER", "UK", False),
            ("spine_index", "INTEGER", "", False),
            ("chapter_title", "VARCHAR", "", True),
            ("text", "VARCHAR", "", False),
            ("word_count", "INTEGER", "", False),
            ("token_count", "INTEGER", "", False),
            ("chunker_version", "INTEGER", "UK", False),
        ],
    ),
    "chunk_vector": (
        "idx",
        [
            ("chunk_id", "INTEGER", "PK FK", False),
            ("model", "VARCHAR", "PK", False),
            ("vector", "BLOB", "", False),
        ],
    ),
    "chunk_fts": (
        "idx",
        [
            ("rowid", "INTEGER", "PK", False),
            ("text", "FTS5 index", "", False),
        ],
    ),
}

COLUMNS = [
    ["user", "user_session", "conversation", "message"],
    ["shelf", "user_book_state", "note"],
    ["book", "book_tag", "tag", "chunk", "chunk_vector", "chunk_fts"],
]

TOP = 90
LANE = 24


class Diagram:
    """One picture of the schema: boxes, links between them, and a legend."""

    def __init__(self, full):
        """Place every table.

        Args:
            full: True draws every column (the ER diagram); False draws only
                the table names inside their blocks.
        """
        self.full = full
        self.width, self.channel, self.margin = (330, 120, 70) if full else (250, 120, 60)
        self.head, self.row, self.gap = (40, 30, 60) if full else (50, 0, 54)
        self.parts = []
        self.boxes = {}
        for c, names in enumerate(COLUMNS):
            x = self.margin + c * (self.width + self.channel)
            y = TOP
            for name in names:
                height = self.head + self.row * len(TABLES[name][1])
                self.boxes[name] = (x, y, self.width, height)
                y += height + self.gap
        self.canvas_w = 2 * self.margin + 3 * self.width + 2 * self.channel
        self.canvas_h = max(y + h for _, y, _, h in self.boxes.values()) + 40

    def side(self, name, side, frac=0.5):
        """Return a point on one side of a table's box.

        Args:
            name: the table.
            side: "l", "r", "t" or "b".
            frac: how far along that side, from 0 to 1.

        Returns:
            The point as (x, y).
        """
        x, y, w, h = self.boxes[name]
        return {
            "l": (x, y + h * frac),
            "r": (x + w, y + h * frac),
            "t": (x + w * frac, y),
            "b": (x + w * frac, y + h),
        }[side]

    def channel_x(self, number, lane):
        """Return the x of a lane in the gap after column `number` (0 is the left margin)."""
        if number == 0:
            return self.margin - 35
        if number == 3:
            return self.canvas_w - self.margin + 35
        return self.margin + number * self.width + (number - 1) * self.channel + lane * LANE

    def text(self, x, y, s, size, anchor="start", weight="normal", fill="#000", style="normal"):
        self.parts.append(
            f'<text x="{x:.0f}" y="{y:.0f}" font-family="{FONT}" font-size="{size}" text-anchor="{anchor}" '
            f'font-weight="{weight}" font-style="{style}" fill="{fill}">{s}</text>'
        )

    def line(self, points, dashed=False, width=2):
        dash = ' stroke-dasharray="9 6"' if dashed else ""
        path = " ".join(f"{x:.0f},{y:.0f}" for x, y in points)
        self.parts.append(f'<polyline points="{path}" fill="none" stroke="#333" stroke-width="{width}"{dash}/>')

    def end_mark(self, tip, before, kind):
        """Draw the mark where a link meets a box.

        Args:
            tip: the point on the box.
            before: the point the line comes from.
            kind: "many" (crow's foot), "one" (bar), "zero-one" (circle and
                bar) or "arrow".
        """
        (tx, ty), (bx, by) = tip, before
        length = abs(tx - bx) + abs(ty - by)
        dx, dy = (tx - bx) / length, (ty - by) / length
        nx, ny = -dy, dx

        def at(back, across):
            return (tx - dx * back + nx * across, ty - dy * back + ny * across)

        if kind == "arrow":
            p = " ".join(f"{x:.0f},{y:.0f}" for x, y in (tip, at(15, 7), at(15, -7)))
            self.parts.append(f'<polygon points="{p}" fill="#333"/>')
        elif kind == "many":
            for across in (-9, 9):
                self.line([at(16, 0), at(0, across)])
        else:
            self.line([at(9, -9), at(9, 9)])
            if kind == "zero-one":
                cx, cy = at(22, 0)
                self.parts.append(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="6" fill="#fff" stroke="#333" stroke-width="2"/>')

    def link(self, points, optional=False, one_to_one=False):
        """Draw a link from the "one" table to the "many" table.

        Args:
            points: the corners of the line, starting at the "one" side.
            optional: the column on the "many" side may be empty.
            one_to_one: both sides are "one".
        """
        if self.full:
            self.line(points)
            self.end_mark(points[0], points[1], "zero-one" if optional else "one")
            self.end_mark(points[-1], points[-2], "one" if one_to_one else "many")
        else:
            self.line(points, dashed=optional, width=4 if one_to_one else 2)
            self.end_mark(points[-1], points[-2], "arrow")

    def elbow(self, src, dst, x):
        """Return a line that leaves `src` sideways, runs down lane `x`, and enters `dst`."""
        return [src, (x, src[1]), (x, dst[1]), dst]

    def links(self):
        """Draw the sixteen relationships."""
        s, cx = self.side, self.channel_x
        for a, b in (("user", "user_session"), ("conversation", "message"), ("book", "book_tag")):
            self.link([s(a, "b"), s(b, "t")])
        self.link([s("tag", "t"), s("book_tag", "b")])
        self.link([s("shelf", "b"), s("user_book_state", "t")], optional=True)
        self.link([s("chunk", "b"), s("chunk_vector", "t")])

        self.link(self.elbow(s("user", "l"), s("conversation", "l"), cx(0, 0)))
        self.link(self.elbow(s("user", "r", 0.2), s("shelf", "l", 0.3), cx(1, 4)))
        self.link(self.elbow(s("user", "r", 0.4), s("user_book_state", "l", 0.3), cx(1, 3)))
        self.link(self.elbow(s("user", "r", 0.6), s("note", "l", 0.3), cx(1, 2)))
        self.link(self.elbow(s("book", "l", 0.3), s("user_book_state", "r", 0.3), cx(2, 1)))
        self.link(self.elbow(s("book", "l", 0.6), s("note", "r", 0.3), cx(2, 2)))
        self.link(self.elbow(s("book", "r"), s("chunk", "r", 0.3), cx(3, 0)))
        self.link(self.elbow(s("chunk", "r", 0.7), s("chunk_fts", "r"), cx(3, 0)), one_to_one=True)

        over = TOP - 52
        user_top, book_top = s("user", "t"), s("book", "t", 0.85)
        self.link([user_top, (user_top[0], over), (book_top[0], over), book_top], optional=True)

        start, end = s("user", "r", 0.8), s("tag", "l")
        under = self.side("note", "b")[1] + 34
        self.link(
            [start, (cx(1, 1), start[1]), (cx(1, 1), under), (cx(2, 4), under), (cx(2, 4), end[1]), end],
            optional=True,
        )

    def groups(self):
        """Draw a coloured frame around the tables of each block."""
        for block, (title, _, fill, stroke) in BLOCKS.items():
            boxes = [self.boxes[name] for name, (b, _) in TABLES.items() if b == block]
            x, w = boxes[0][0], boxes[0][2]
            top = min(y for _, y, _, _ in boxes) - 32
            bottom = max(y + h for _, y, _, h in boxes) + 12
            self.parts.append(
                f'<rect x="{x - 14}" y="{top}" width="{w + 28}" height="{bottom - top}" rx="8" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'
            )
            self.text(x - 4, top + 22, title, 17, weight="bold", fill=stroke)

    def tables(self):
        """Draw every table's box, and its columns in the full picture."""
        for name, (block, columns) in TABLES.items():
            x, y, w, h = self.boxes[name]
            _, head_fill, _, stroke = BLOCKS[block]
            self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="{stroke}" stroke-width="2"/>')
            self.parts.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{self.head}" fill="{head_fill}" stroke="{stroke}" stroke-width="2"/>'
            )
            self.text(x + w / 2, y + self.head / 2 + 8, name, 22, anchor="middle", weight="bold")
            if not self.full:
                continue
            for i, (column, kind, key, empty) in enumerate(columns):
                base = y + self.head + self.row * i + 21
                self.text(x + 12, base, column, 20, style="italic" if empty else "normal")
                self.text(x + 178, base, kind, 15, fill="#555")
                self.text(x + w - 10, base, key, 15, anchor="end", weight="bold")

    def legend(self):
        """Explain the marks, in the free corner under the left column."""
        x = self.margin
        y = self.side("message", "b")[1] + (110 if self.full else 62)
        if self.full:
            rows = [
                ("one", "many", "one row to many rows"),
                ("zero-one", "many", "the link may be empty"),
                ("one", "one", "one row to one row"),
            ]
            for i, (left, right, label) in enumerate(rows):
                a, b = (x, y + 44 * i), (x + 110, y + 44 * i)
                self.line([a, b])
                self.end_mark(a, b, left)
                self.end_mark(b, a, right)
                self.text(x + 130, y + 44 * i + 7, label, 20)
            notes = [
                "PK: primary key.  FK: foreign key.",
                "UK: column of a unique index.",
                "A name in italics may be empty (NULL).",
            ]
            for i, note in enumerate(notes):
                self.text(x, y + 150 + 32 * i, note, 20)
        else:
            rows = [
                (False, 2, "one row to many rows"),
                (True, 2, "the same, and the link may be empty"),
                (False, 4, "one to one, kept by three triggers"),
            ]
            for i, (dashed, width, label) in enumerate(rows):
                a, b = (x, y + 36 * i), (x + 70, y + 36 * i)
                self.line([a, b], dashed=dashed, width=width)
                self.end_mark(b, a, "arrow")
                self.text(x + 86, y + 36 * i + 6, label, 18)

    def svg(self):
        """Return the whole picture as SVG text."""
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.canvas_w}" height="{self.canvas_h}">',
            f'<rect width="{self.canvas_w}" height="{self.canvas_h}" fill="#ffffff"/>',
        ]
        if not self.full:
            self.groups()
        self.links()
        self.tables()
        self.legend()
        self.parts.append("</svg>")
        return "\n".join(self.parts) + "\n"


def main():
    """Write blocks.svg and er.svg next to this script."""
    for name, full in (("blocks", False), ("er", True)):
        out = HERE / f"{name}.svg"
        out.write_text(Diagram(full).svg(), encoding="utf-8", newline="\n")
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
