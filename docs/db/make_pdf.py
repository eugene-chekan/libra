"""Make the two PDF files that the expert gets with the database block.

Run from the repository root:

    uv run --no-project --with markdown --with pymdown-extensions python docs/db/make_pdf.py

It writes docs/db/out/data-dictionary.pdf and docs/db/out/run-for-the-expert.pdf.
Each Markdown file becomes a web page, and Microsoft Edge or Google Chrome
prints that page to PDF, so one of the two must be installed.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

HERE = Path(__file__).parent
OUT_DIR = HERE / "out"
SOURCES = ("data-dictionary.md", "run-for-the-expert.md")
GITHUB = "https://github.com/eugene-chekan/libra/blob/main/"
DOCX = "the main document (`DB_Chekan_Yauheni.docx`)"

BROWSERS = (
    "msedge",
    "chrome",
    "google-chrome",
    "chromium",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)

CSS = """
@page { size: A4; margin: 2cm 2cm 2cm 2.5cm; }
body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.45; color: #000; }
h1 { font-size: 18pt; margin: 0 0 12pt; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; break-after: avoid; }
h3 { font-size: 12pt; margin: 14pt 0 6pt; break-after: avoid; }
hr { border: 0; border-top: 1px solid #999; margin: 14pt 0; }
code { font-family: Consolas, monospace; font-size: 10pt; }
pre { background: #f3f3f3; border: 1px solid #ccc; padding: 6pt 8pt; white-space: pre-wrap;
      word-break: break-word; line-height: 1.25; break-inside: avoid; }
pre code { font-size: 9pt; }
li { margin: 3pt 0; }
.highlight { margin: 6pt 0; }
table { border-collapse: collapse; width: 100%; font-size: 10.5pt; margin: 8pt 0; }
tr { break-inside: avoid; }
th, td { border: 1px solid #000; padding: 3pt 6pt; text-align: left; vertical-align: top; }
th { background: #d9e2f3; }
a { color: #1a4f9c; }
"""


def find_browser():
    """Return the path of Edge or Chrome, or stop with a message."""
    for name in BROWSERS:
        found = shutil.which(name) or (name if Path(name).is_file() else None)
        if found:
            return found
    sys.exit("Microsoft Edge or Google Chrome is needed to print the PDF.")


def for_the_expert(text):
    """Point the links of a Markdown file at what the expert has.

    Args:
        text: the Markdown source.

    Returns:
        The text with links to `database.md` replaced by the name of the DOCX,
        links to the sent SQL files replaced by their names, and other links
        inside the project replaced by GitHub addresses.
    """
    text = re.sub(r"\[database\.md\]\(database\.md(#[\w-]+)?\)", DOCX, text)
    text = re.sub(r"\[((?:schema|test-data)\.sql)\]\(\1\)", r"`\1`", text)
    text = text.replace("(../../", f"({GITHUB}")
    return re.sub(r"\]\((?!https?:)([\w.-]+)(#[\w-]+)?\)", rf"]({GITHUB}docs/db/\1)", text)


def to_html(text):
    """Turn Markdown into one web page with print styles.

    Args:
        text: the Markdown source.

    Returns:
        The page as HTML text.
    """
    title = re.search(r"^# (.+)$", text, flags=re.MULTILINE).group(1)
    # A block inside a list item is indented by 3 spaces here; the library wants 4.
    text = re.sub(r"^   (?=\S)", "    ", text, flags=re.MULTILINE)
    body = markdown.markdown(text, extensions=["tables", "pymdownx.superfences", "sane_lists"])
    return (
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>'
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )


def main():
    """Write one PDF for each file in SOURCES."""
    browser = find_browser()
    OUT_DIR.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name in SOURCES:
            source = HERE / name
            page = Path(tmp) / source.with_suffix(".html").name
            page.write_text(to_html(for_the_expert(source.read_text(encoding="utf-8"))), encoding="utf-8")
            pdf = (OUT_DIR / source.with_suffix(".pdf").name).resolve()
            subprocess.run(
                [browser, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf}", page.as_uri()],
                check=True,
                capture_output=True,
            )
            print(f"wrote {pdf}")


if __name__ == "__main__":
    main()
