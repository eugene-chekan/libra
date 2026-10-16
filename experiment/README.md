# The retrieval experiment's data

The design is in [docs/specs/phase-2-plan.md](../docs/specs/phase-2-plan.md).
Everything here goes straight to `main`, like the docs.

- `corpus.csv` — the 42 books: 20 fiction and 20 non-fiction test books, and
  2 pilot books for tuning the descriptor prompt (*Mike*, fiction, and
  *Essays* by Malatesta, non-fiction). Each row has the file name, the file's
  `sha256`, the title and author, the genre and role, and the Standard Ebooks
  link.
- `corpus-stats.csv` — what chunker version 1 makes of each book: words,
  chunks, the largest chunk in tokens, chunks under 100 words, and
  `chunks_sha256`, a hash of the book's chunk texts.

## The files

The books come from Standard Ebooks and are public domain (CC0). They were
exported once, on 2026-10-11, through libra's own API, from the author's
public shelf "Diploma experiment pick". They are not in the repository:
`experiment/files/` is git-ignored. Each file is named after its Standard
Ebooks link, for example `john-buchan_huntingtower.epub`.

Get them from the GitHub release
[`experiment-corpus-v1`](https://github.com/eugene-chekan/libra/releases/tag/experiment-corpus-v1)
and unzip `corpus-v1.zip` (sha256 `5f15b95eeda2f8f4eaf6a9e9f676b9db6131f40fa2b54411b8710f38fb02e822`)
into `experiment/files/`.

Standard Ebooks corrects its books over time, so a link can later give a
different file. `rag load-corpus` and `rag corpus-stats` refuse any file
whose `sha256` differs from `corpus.csv`.

The genre of each book was decided by hand, using the rule in the spec's
Books section. Standard Ebooks' own `z3998:fiction` and `z3998:non-fiction`
tags were not used: they are wrong for some books.

## The database

The experiment uses its own database, never a real library. From
`backend/`:

    mkdir -p ../.run/experiment
    export LIBRA_DATABASE_URL="sqlite:///../.run/experiment/libra.db"
    export LIBRA_LIBRARY_DIR="../.run/experiment/library"
    uv run python -m app.cli rag load-corpus ../experiment/corpus.csv ../experiment/files

Only the 40 test books go into it. `load-corpus` refuses a database that
holds any other book, and it checks this before it migrates anything.

## The freeze

**The chunker is frozen at version 1 since 2026-10-16.** Every question label
names this version. Any change to the chunks raises it, and the labels made
with the old version stop being valid.

Chunk boundaries also depend on the tokenizer. Version 1 was frozen with:

- the model `BAAI/bge-base-en-v1.5`, served by `fastembed` 0.9.0 as
  `Qdrant/bge-base-en-v1.5-onnx-Q`, revision
  `199291fdd1aa89faf9c20b722dc72ad5e17aa0d0`
- `tokenizers` 0.23.3 and `onnxruntime` 1.31.0

A run on another machine should give the same `chunks_sha256` for every
book. If one differs, the tokenizer differs, and the labels do not fit that
run.

The frozen corpus: 9,476 chunks in the 40 test books (10,025 with the pilot
books). The test books hold 1,317,373 words of fiction and 1,199,794 of
non-fiction, a gap of 9.8% (the rule allows 10%). The largest chunk is 450
tokens.
