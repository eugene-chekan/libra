"""Build the BA block DOCX from ba.md and references.md.

Run from the repository root:

    uv run --no-project --with python-docx python docs/ba/build.py

The output goes to docs/ba/out/. Word asks to update fields when it opens the
file; answer Yes, so the table of contents gets its page numbers.
"""

import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.image.image import Image as DocxImage
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = Path(__file__).parent
SOURCE = HERE / "ba.md"
REFERENCES = HERE / "references.md"
DIAGRAMS = HERE / "diagrams"
OUT_DIR = HERE / "out"

FONT = "Times New Roman"
BODY_PT = 12
TABLE_PT = 10
TEXT_WIDTH_CM = 16.5
TEXT_FIGURE_WIDTH_CM, TEXT_FIGURE_HEIGHT_CM = 16, 10
FULL_WIDTH_CM, FULL_HEIGHT_CM = 16, 23

CITE = re.compile(r"\[(@[\w-]+(?:\s*;\s*@[\w-]+)*)\]")
INLINE = re.compile(
    r"(?P<cite>\[@[\w-]+(?:\s*;\s*@[\w-]+)*\])"
    r"|(?P<link>\[(?P<ltext>[^\]]+)\]\([^)]+\))"
    r"|(?P<bold>\*\*(?P<btext>.+?)\*\*)"
    r"|(?P<ital>\*(?P<itext>[^*]+?)\*)"
    r"|(?P<code>`(?P<ctext>[^`]+)`)"
)


def read_front_matter(text):
    """Split the YAML-like header from the body.

    Args:
        text: the whole source file.

    Returns:
        A dict of header fields and the body text.
    """
    meta = {}
    if text.startswith("---"):
        header, body = text[3:].split("\n---", 1)
        for line in header.strip().splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
        return meta, body
    return meta, text


def read_references():
    """Read `@key: entry` lines from references.md."""
    refs = {}
    for line in REFERENCES.read_text(encoding="utf-8").splitlines():
        m = re.match(r"@([\w-]+):\s*(.+)", line)
        if m:
            refs[m.group(1)] = m.group(2)
    return refs


def number_citations(body, refs):
    """Number sources in the order the text first cites them.

    Args:
        body: the document body.
        refs: all known references by key.

    Returns:
        A dict from key to number.
    """
    order = {}
    for m in CITE.finditer(body):
        for key in re.findall(r"@([\w-]+)", m.group(1)):
            if key not in refs:
                sys.exit(f"Unknown reference: @{key}")
            order.setdefault(key, len(order) + 1)
    for key in refs:
        if key not in order:
            print(f"warning: @{key} is never cited and is left out")
    return order


def set_cell_shading(cell, fill):
    """Give a table cell a background colour."""
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(shd)


def column_widths(rows, cols):
    """Share the text width between columns by how long their text is.

    Args:
        rows: the table's cells as strings, header first.
        cols: the number of columns.

    Returns:
        One width per column, summing to TEXT_WIDTH_CM.
    """
    weights = []
    for c in range(cols):
        longest = max(len(row[c]) if c < len(row) else 0 for row in rows)
        longest_word = max((len(w) for row in rows if c < len(row) for w in row[c].split()), default=4)
        weights.append(min(max(longest, longest_word + 2, 6), 70))
    total = sum(weights)
    return [Cm(TEXT_WIDTH_CM * w / total) for w in weights]


def figure_width(path, full_size):
    """Pick a figure's width so that it fits the page and the text.

    Args:
        path: the image file.
        full_size: True for the Appendix B copy, False for the copy in the text.

    Returns:
        The width to insert the picture at.
    """
    image = DocxImage.from_file(str(path))
    max_width, max_height = (FULL_WIDTH_CM, FULL_HEIGHT_CM) if full_size else (TEXT_FIGURE_WIDTH_CM, TEXT_FIGURE_HEIGHT_CM)
    return Cm(min(max_width, max_height * image.px_width / image.px_height))


def add_field(paragraph, instruction):
    """Insert a Word field, such as PAGE or TOC, into a paragraph."""
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "Right-click and choose Update Field."
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for element in (begin, instr, separate, placeholder, end):
        run._r.append(element)


class Builder:
    """Turns the Markdown subset used by ba.md into a Word document."""

    def __init__(self, meta, citations, refs):
        self.meta = meta
        self.citations = citations
        self.refs = refs
        self.doc = Document()
        self.figures = 0
        self.tables = 0
        self.pending_table_caption = None
        self.setup_styles()

    def setup_styles(self):
        """Set the page, fonts, spacing and the page-number footer."""
        section = self.doc.sections[0]
        section.page_width, section.page_height = Cm(21), Cm(29.7)
        section.left_margin = Cm(3)
        section.right_margin = Cm(1.5)
        section.top_margin = section.bottom_margin = Cm(2)

        normal = self.doc.styles["Normal"]
        normal.font.name = FONT
        normal.font.size = Pt(BODY_PT)
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        normal.paragraph_format.line_spacing = 1.5
        normal.paragraph_format.space_after = Pt(6)

        for level, size in ((1, 16), (2, 14), (3, 12)):
            style = self.doc.styles[f"Heading {level}"]
            style.font.name = FONT
            style.font.size = Pt(size)
            style.font.bold = True
            style.font.color.rgb = RGBColor(0, 0, 0)
            style.element.rPr.rFonts.set(qn("w:asciiTheme"), "")
            style.paragraph_format.space_before = Pt(12)
            style.paragraph_format.space_after = Pt(6)

        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_field(footer, "PAGE")
        section.different_first_page_header_footer = True

        settings = self.doc.settings.element
        update = OxmlElement("w:updateFields")
        update.set(qn("w:val"), "true")
        settings.append(update)

    def inline(self, paragraph, text, size=None, highlight=False, bold=False):
        """Add text with inline Markdown, citations and TODO markers."""
        i = 0
        while i < len(text):
            start = text.find("[TODO", i)
            if start == -1:
                self.plain(paragraph, text[i:], size, highlight, bold)
                return
            self.plain(paragraph, text[i:start], size, highlight, bold)
            depth, j = 0, start
            while j < len(text):
                depth += {"[": 1, "]": -1}.get(text[j], 0)
                if depth == 0:
                    break
                j += 1
            self.plain(paragraph, text[start : j + 1], size, True, bold)
            i = j + 1

    def plain(self, paragraph, text, size, highlight, bold):
        """Add text that holds no TODO marker."""
        pos = 0
        for m in INLINE.finditer(text):
            self.run(paragraph, text[pos : m.start()], size, highlight, bold)
            if m.group("cite"):
                keys = re.findall(r"@([\w-]+)", m.group("cite"))
                nums = ", ".join(f"[{self.citations[k]}]" for k in keys)
                self.run(paragraph, nums, size, highlight, bold)
            elif m.group("link"):
                self.run(paragraph, m.group("ltext"), size, highlight, bold)
            elif m.group("bold"):
                self.plain(paragraph, m.group("btext"), size, highlight, True)
            elif m.group("ital"):
                self.run(paragraph, m.group("itext"), size, highlight, bold, italic=True)
            elif m.group("code"):
                self.run(paragraph, m.group("ctext"), size, highlight, bold, code=True)
            pos = m.end()
        self.run(paragraph, text[pos:], size, highlight, bold)

    def run(self, paragraph, text, size, highlight, bold, italic=False, code=False):
        """Add one formatted run."""
        if not text:
            return
        run = paragraph.add_run(text)
        run.bold = bold or None
        run.italic = italic or None
        if size:
            run.font.size = Pt(size)
        if code:
            run.font.name = "Consolas"
        if highlight:
            run.font.highlight_color = WD_COLOR_INDEX.YELLOW

    def title_page(self):
        """Write the title page from the front matter."""
        m = self.meta
        for text, size, bold, space in (
            ("European Humanities University", 14, True, 0),
            (m.get("programme", ""), 12, False, 120),
            (m.get("title", ""), 18, True, 12),
            (m.get("subtitle", ""), 13, False, 100),
            (f"Author: {m.get('author', '')}", 12, False, 0),
            (f"Supervisor: {m.get('supervisor', '')}", 12, False, 0),
            (f"Project type: {m.get('type', '')}", 12, False, 160),
            (m.get("place", ""), 12, False, 0),
        ):
            p = self.doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_after = Pt(space)
            self.inline(p, text, size=size, bold=bold)

    def toc(self):
        """Write the automatic table of contents."""
        p = self.doc.add_paragraph()
        p.paragraph_format.page_break_before = True
        self.run(p, "Contents", 16, False, True)
        add_field(self.doc.add_paragraph(), r'TOC \o "1-2" \h \z \u')

    def heading(self, text, level):
        h = self.doc.add_heading(level=level)
        h.paragraph_format.page_break_before = level == 1
        self.inline(h, text)

    def paragraph(self, text):
        self.inline(self.doc.add_paragraph(), text)

    def bullet(self, text):
        p = self.doc.add_paragraph(style="List Bullet")
        self.inline(p, text)

    def numbered(self, number, text):
        p = self.doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(1)
        p.paragraph_format.first_line_indent = Cm(-0.6)
        self.inline(p, f"{number}. {text}")

    def caption(self, text, alignment=WD_ALIGN_PARAGRAPH.LEFT):
        p = self.doc.add_paragraph()
        p.alignment = alignment
        p.paragraph_format.keep_with_next = alignment == WD_ALIGN_PARAGRAPH.LEFT
        self.inline(p, text, size=11, bold=True)

    def table(self, rows):
        """Write a pipe table; the first row is the header."""
        if self.pending_table_caption:
            self.tables += 1
            self.caption(f"Table {self.tables}. {self.pending_table_caption}")
            self.pending_table_caption = None
        cols = len(rows[0])
        table = self.doc.add_table(rows=len(rows), cols=cols)
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        widths = column_widths(rows, cols)
        for r, cells in enumerate(rows):
            for c in range(cols):
                cell = table.cell(r, c)
                cell.width = widths[c]
                p = cell.paragraphs[0]
                p.paragraph_format.line_spacing = 1.0
                p.paragraph_format.space_after = Pt(0)
                self.inline(p, cells[c] if c < len(cells) else "", size=TABLE_PT, bold=r == 0)
                if r == 0:
                    set_cell_shading(cell, "D9E2F3")
        self.doc.add_paragraph()

    def figure(self, filename, caption):
        """Insert a diagram, or a highlighted placeholder until it exists."""
        self.figures += 1
        path = DIAGRAMS / filename
        p = self.doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if path.exists():
            p.add_run().add_picture(str(path), width=figure_width(path, caption.endswith("full size")))
        else:
            self.run(p, f"[TODO: diagram docs/ba/diagrams/{filename}]", None, True, False)
        self.caption(f"Figure {self.figures}. {caption}", WD_ALIGN_PARAGRAPH.CENTER)

    def references(self):
        for key, number in sorted(self.citations.items(), key=lambda kv: kv[1]):
            p = self.doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(1)
            p.paragraph_format.first_line_indent = Cm(-1)
            p.paragraph_format.line_spacing = 1.15
            self.inline(p, f"[{number}]\t{self.refs[key]}")

    def build(self, body):
        """Walk the body line by line and write each block."""
        self.title_page()
        lines = body.strip().splitlines()
        buffer, kind, number = [], None, 0

        def flush():
            nonlocal buffer, kind
            if buffer:
                text = " ".join(s.strip() for s in buffer)
                {"p": self.paragraph, "b": self.bullet}.get(kind, lambda t: self.numbered(number, t))(text)
            buffer, kind = [], None

        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            if not stripped:
                flush()
            elif stripped == "[[TOC]]":
                flush()
                self.toc()
            elif stripped == "[[REFERENCES]]":
                flush()
                self.references()
            elif m := re.match(r"\[\[TABLE:\s*(.+)\]\]$", stripped):
                flush()
                self.pending_table_caption = m.group(1)
            elif m := re.match(r"\[\[FIGURE:\s*(\S+)\s*\|\s*(.+)\]\]$", stripped):
                flush()
                self.figure(m.group(1), m.group(2))
            elif m := re.match(r"(#{1,3}) (.+)", stripped):
                flush()
                self.heading(m.group(2), len(m.group(1)))
            elif stripped.startswith("|"):
                flush()
                rows = []
                while i < len(lines) and lines[i].strip().startswith("|"):
                    row = lines[i].strip().strip("|")
                    if not re.fullmatch(r"[\s|:-]+", row):
                        rows.append([c.strip() for c in row.split("|")])
                    i += 1
                self.table(rows)
                continue
            elif m := re.match(r"- (.+)", stripped):
                flush()
                buffer, kind = [m.group(1)], "b"
            elif m := re.match(r"(\d+)\. (.+)", stripped):
                flush()
                buffer, kind, number = [m.group(2)], "n", int(m.group(1))
            else:
                if kind is None:
                    kind = "p"
                buffer.append(stripped)
            i += 1
        flush()


def main():
    meta, body = read_front_matter(SOURCE.read_text(encoding="utf-8"))
    refs = read_references()
    citations = number_citations(body, refs)
    builder = Builder(meta, citations, refs)
    builder.build(body)
    OUT_DIR.mkdir(exist_ok=True)
    name = meta.get("file", "BA_Surname_Name.docx")
    builder.doc.save(OUT_DIR / name)
    print(f"wrote {OUT_DIR / name}: {builder.figures} figures, {builder.tables} captioned tables, {len(citations)} sources")


if __name__ == "__main__":
    main()
