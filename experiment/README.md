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
- `questions/hand.jsonl` — the 40 hand questions, one JSON line for each
  answer. See "Writing the hand questions" below.

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

## Writing the hand questions

The hand set is 40 questions: one for each test book, so 20 fiction and 20
non-fiction. You write them yourself, before any search result exists. No
search over these books runs until all 40 are written, so no result can steer
a question.

You need the files in `experiment/files/` (see above). The command does not
use the database. The first run downloads the embedding model (about 210 MB)
for its tokenizer. From `backend/`:

    uv run python -m app.cli rag hand-question ../experiment/corpus.csv ../experiment/files --stats ../experiment/corpus-stats.csv --out ../experiment/questions/hand.jsonl

The command first checks every test book's file against `corpus.csv`. Then it
takes the next book that has no question yet, checks its chunks against
`corpus-stats.csv`, and shows one chunk. The screen shows how many questions
are written, the counts of each kind, the genre, the title, the chapter, and
the chunk's text. Every chunk it shows has at least 100 words.

Then it asks:

1. `Question (s = skip this chunk, q = quit):` — type your question and press
   Enter.
   - `s` skips the chunk. It asks `Why skip?`, and then it shows another chunk
     from the same book. A skipped chunk never comes back.
   - `q` stops the session.
2. `Kind (f = factual, i = interpretive):` — `f` for who, what or where; `i`
   for why, feelings or ideas. It asks again until you type `f` or `i`.

Each answer is saved the moment you finish it: a question once you type its
kind, a skip once you type its reason. `q`, Ctrl-C or a closed window lose only
the answer you have not finished. The next run starts again at the same book,
with the same chunk.

A question must meet these rules (the same rules as the review of the drafts):

- It can be answered from this chunk alone.
- A real reader could ask it.
- It is clear which book it is about.
- Names of people and places are allowed. Use your own words for the rest:
  do not copy other wording from the chunk.
- Its kind is right.

The drafts will be half factual and half interpretive. Aim for about the same
here; the screen shows the counts so far.

To fix a typo, edit the `question` value in `hand.jsonl` with a text editor.
Keep each record on one line. If a line breaks, the command names it.

Commit `questions/hand.jsonl` to `main` after each session.
