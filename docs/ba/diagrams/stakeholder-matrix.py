"""Draw the influence/interest matrix of section 2.2 as an SVG.

Run from the repository root, then convert the SVG to PNG with ImageMagick:

    python docs/ba/diagrams/stakeholder-matrix.py
    magick -density 150 docs/ba/diagrams/stakeholder-matrix.svg docs/ba/diagrams/stakeholder-matrix.png

Influence follows the H/M/L column of the stakeholder table in ba.md.
Interest is placed from the "Interest" column of the same table.
"""

from pathlib import Path

OUT = Path(__file__).with_suffix(".svg")

LEFT, RIGHT, TOP, BOTTOM = 170, 1270, 60, 760
FONT = "Arial"

# (name, interest 0..1, influence 0..1, label side)
STAKEHOLDERS = [
    ("Diploma supervisor", 0.78, 0.93, "left"),
    ("Committee and experts", 0.62, 0.64, "right"),
    ("Author as developer", 0.93, 0.88, "left"),
    ("Author as researcher", 0.93, 0.76, "left"),
    ("Household administrator", 0.38, 0.80, "left"),
    ("Reader", 0.86, 0.42, "left"),
    ("Kindle owner", 0.62, 0.18, "right"),
    ("LLM provider (DeepSeek)", 0.14, 0.20, "right"),
    ("Standard Ebooks", 0.22, 0.09, "right"),
]

QUADRANTS = [
    ("Keep satisfied", 0.25, 0.97),
    ("Manage closely", 0.75, 0.97),
    ("Monitor", 0.25, 0.47),
    ("Keep informed", 0.75, 0.47),
]


def x(interest: float) -> float:
    """Return the x pixel for an interest level from 0 to 1."""
    return LEFT + interest * (RIGHT - LEFT)


def y(influence: float) -> float:
    """Return the y pixel for an influence level from 0 to 1."""
    return BOTTOM - influence * (BOTTOM - TOP)


def text(px, py, s, size=22, anchor="start", weight="normal", fill="#000", style="normal"):
    """Return one SVG text element."""
    return (
        f'<text x="{px:.0f}" y="{py:.0f}" font-family="{FONT}" font-size="{size}" '
        f'text-anchor="{anchor}" font-weight="{weight}" font-style="{style}" fill="{fill}">{s}</text>'
    )


def main():
    """Write the matrix to stakeholder-matrix.svg."""
    mid_x, mid_y = x(0.5), y(0.5)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{RIGHT + 30}" height="{BOTTOM + 90}">',
        f'<rect width="{RIGHT + 30}" height="{BOTTOM + 90}" fill="#ffffff"/>',
        f'<rect x="{x(0.5)}" y="{TOP}" width="{RIGHT - mid_x}" height="{mid_y - TOP}" fill="#dce6f5"/>',
        f'<rect x="{LEFT}" y="{TOP}" width="{RIGHT - LEFT}" height="{BOTTOM - TOP}" fill="none" stroke="#000" stroke-width="2"/>',
        f'<line x1="{mid_x}" y1="{TOP}" x2="{mid_x}" y2="{BOTTOM}" stroke="#000" stroke-width="1.5"/>',
        f'<line x1="{LEFT}" y1="{mid_y}" x2="{RIGHT}" y2="{mid_y}" stroke="#000" stroke-width="1.5"/>',
    ]
    for name, qx, qy in QUADRANTS:
        parts.append(text(x(qx), y(qy) + 10, name, size=24, anchor="middle", fill="#555", style="italic"))
    for name, interest, influence, side in STAKEHOLDERS:
        px, py = x(interest), y(influence)
        parts.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="9" fill="#2f5597"/>')
        if side == "left":
            parts.append(text(px - 16, py + 8, name, anchor="end"))
        else:
            parts.append(text(px + 16, py + 8, name))
    parts.append(text((LEFT + RIGHT) / 2, BOTTOM + 40, "Interest in the project", size=24, anchor="middle", weight="bold"))
    parts.append(text(LEFT - 12, BOTTOM + 40, "Low", size=20, anchor="start"))
    parts.append(text(RIGHT, BOTTOM + 40, "High", size=20, anchor="end"))
    cx, cy = LEFT - 70, (TOP + BOTTOM) / 2
    parts.append(
        f'<text x="{cx}" y="{cy}" font-family="{FONT}" font-size="24" font-weight="bold" '
        f'text-anchor="middle" transform="rotate(-90 {cx} {cy})">Influence on the project</text>'
    )
    parts.append(text(LEFT - 14, BOTTOM, "Low", size=20, anchor="end"))
    parts.append(text(LEFT - 14, TOP + 18, "High", size=20, anchor="end"))
    parts.append("</svg>")
    OUT.write_text("\n".join(parts) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
