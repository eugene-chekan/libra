# Business Analysis block

The BA block of the diploma: the Introduction, Chapter 1 and Chapter 2, in
English, as one DOCX. **Due to the experts by 30 October 2026.** The
requirements are the department's "Business Analysis Block Requirements
for the Diploma Project (2026/27)".

## Files

| File | What it is |
|---|---|
| `ba.md` | The text. Edit this, not the DOCX. |
| `references.md` | The sources, one `@key: entry` line each, in IEEE style |
| `build.py` | Turns `ba.md` into `out/BA_Surname_Name.docx` |
| `diagrams/*.puml` | PlantUML sources for the diagrams |
| `diagrams/*.png` | The rendered diagrams and screenshots. `build.py` puts each one where `ba.md` names it. |

## Build

From the repository root:

```bash
uv run --no-project --with python-docx python docs/ba/build.py
```

Open the result in Word and answer **Yes** when it asks to update fields. That
fills in the table of contents and its page numbers. Then rename the file to
`BA_Surname_Name.docx` with your own name.

## What `ba.md` understands

- `#`, `##`, `###` headings. Each `#` heading starts a new page.
- Paragraphs, `- ` bullets, `1. ` numbered steps, and pipe tables.
- `**bold**`, `*italic*`, `` `code` ``.
- `[@key]` or `[@a; @b]` cites a source. Sources are numbered in the order the
  text first cites them.
- `[TODO: ...]` is highlighted in yellow. **The file must have none left
  when you send it.** Check with `grep -n TODO docs/ba/ba.md`.
- `[[TABLE: caption]]` on the line before a table gives it a numbered caption.
- `[[FIGURE: name.png | caption]]` inserts `diagrams/name.png`, or a yellow
  placeholder while the file does not exist.

## Diagrams

The rendered `.png` files are committed, so `build.py` works without any of
these tools. Render again after you change a source.

**The four UML diagrams** (`as-is`, `context`, `use-cases`, `sequence-uc1`)
are PlantUML files. The use case and context diagrams use PlantUML's own
layout engine (`smetana`), so Graphviz is not needed. With Java 11 or newer and the PlantUML `.jar` from
https://github.com/plantuml/plantuml/releases, from the repository root:

```bash
java -jar plantuml.jar -tpng -charset UTF-8 docs/ba/diagrams/*.puml
```

The PlantUML extension in VS Code also works.

**The influence/interest matrix** is drawn by a small script. The positions
are in `STAKEHOLDERS` at the top of the script:

```bash
python docs/ba/diagrams/stakeholder-matrix.py
magick -density 150 docs/ba/diagrams/stakeholder-matrix.svg docs/ba/diagrams/stakeholder-matrix.png
```

**Pictures only you can make:**

- `analog-screens.png`: screenshots of the analogs answering the test questions
- the 3–4 mockups in Section 2.5 (add a `[[FIGURE: ...]]` line for each)
