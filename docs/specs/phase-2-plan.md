# Phase 2 — Retrieval Experiment: Scope and Plan

**Status:** Design approved 2026-09-13. Revised 2026-10-11 against the topic
application: a four-week schedule, the main comparisons tested in both genres,
and a written genre rule. Part 1 started 2026-10-12. Week 1 done 2026-10-16:
the chunker is frozen at version 1 and the 40 test books are loaded (see
[experiment/README.md](../../experiment/README.md)).

This plan replaces the earlier Phase 2 outline in
[architecture.md](../architecture.md), which planned a Chroma vector store and
a retrieval endpoint.

## What changed, and why

On 2026-09-08 the diploma supervisor approved the topic, and changed what the
diploma builds:

- The practice part is a **research experiment**, not a full RAG pipeline. It
  compares ways to find the passage that answers a question, on a fixed set of
  books.
- The method under test: an LLM writes short, free-form **semantic
  descriptors** for every chunk, such as "moral choice under pressure". Search
  then uses the descriptors as a second space, next to the chunk text. The idea
  comes from Simon Willison's post "Don't classify. Hallucinate!" (2026-08-14),
  about a technique by Doug Turnbull.
- If the method works, it becomes the search inside libra.

Decisions made on 2026-09-13:

- **The user study is removed from the diploma.** The experiment replaces it.
- **The librarian agent (Phase 3) moves to after the diploma.** In the diploma,
  the librarian panel is only a thin layer over search: a question goes in,
  passages come out.
- **The panel shows the passages it found. It does not write answers.** The
  test books are public-domain classics, and an LLM already knows many of them
  from training. A written answer could be right without any passage, so it
  would hide exactly what the experiment measures. Written answers come after
  the diploma.
- **The experiment reuses libra's own code**, so the numbers in the report
  describe the system shown at the demo.

## The university timeline

| Dates | Stage | What it means here |
|---|---|---|
| until 20 Sep | Topic application, agreed with the supervisor | — |
| 28 Sep – 14 Nov | Practice. **Practice defense 9–14 Nov.** A failed defense ends the diploma. | Part 1 finished by about 7 Nov |
| 15 Nov – 6 Jan | Diploma project and thesis text, 95% done | Part 2, the thesis, the business analysis document and the ER diagram |
| **6–9 Jan** | **Pre-defense, in English, with a demo** | The panel must work |
| 10 Jan – 6 Feb | Format check, external review, defense | No new code |

So the work has two parts:

1. **Part 1 — the experiment**, for the practice defense. Designed in full
   below.
2. **Part 2 — the panel shows search results**, for the pre-defense demo.
   Sketched at the end. It gets its own short spec in November, once the
   results are known.

Phase 2 is complete when part 2 ships. The version then becomes `0.3.0`.

## What the topic application promises

The committee checks the diploma against the topic application (dated
2026-09-16). Its title, as the dean's office approved it on 2026-09-23: "A
Passage Retrieval System for an E-book Library Using LLM-Generated Semantic
Descriptors". The application names no model and no provider. Those belong in
the technical assignment and in the experiment protocol.

| The application says | Where this plan does it |
|---|---|
| Six configurations: BM25, embeddings, descriptors, and three hybrids merged with RRF | [Methods](#methods) |
| The main comparison: embeddings + descriptors against embeddings alone, and against BM25 + embeddings | [Hypotheses](#hypotheses): H1 and H2, in each genre |
| Public-domain books in English, and questions in English | [Books](#books) |
| Each question comes from one known passage, which is its reference answer | [Test questions](#test-questions) |
| Some questions written by hand; the rest drafted by a language model and checked by hand | [Two sets](#two-sets) |
| All relevant passages marked by hand on a random sample of questions | [The weakness of one correct chunk](#the-weakness-of-one-correct-chunk) |
| The descriptor prompt tuned on books outside the test corpus | [Descriptor procedure](#descriptor-procedure-protocol-v1) |
| No method settings tuned on test questions; the protocol fixed before the final run | [The protocol is frozen](#the-protocol-is-frozen-before-the-full-run) |
| Recall@5, Recall@10 and MRR@10, for fiction and non-fiction separately | [Metrics](#metrics) |
| Paired bootstrap 95% intervals, a randomisation test, and the Holm correction | [Statistics](#statistics) |
| The librarian panel shows the passages that the best configuration finds | [Part 2](#part-2--the-librarian-panel-sketch) |

The application also claims seven complexity criteria. Two of them need work
that this plan's code does not produce:

- **Business Analysis:** a document with the vision, the problem, the
  stakeholders (reader, administrator, Kindle owner), the scope and features,
  and a comparison with Calibre-web.
- **Database:** an ER diagram, including the new chunk, vector and descriptor
  tables.

Neither exists yet. Both are due with the thesis text, by 6 Jan. The ER
diagram waits until the part 1 tables exist.

---

# Part 1 — the experiment

## Scope

**In:**

- Reading the EPUB spine (#35), and a chunker.
- About 40 public-domain books: 20 fiction and 20 non-fiction, loaded through
  the normal upload pipeline.
- Four ways to search: BM25, text embeddings, descriptors, and hybrids that
  merge rankings.
- Descriptors written by `deepseek-v4-pro`, following a fixed, written-down
  procedure.
- Test questions: DeepSeek drafts about 10 per book and the author reviews
  them, plus about 40 written by hand.
- recall@5, recall@10 and MRR@10, split by genre, with statistical tests and a
  review of failures.
- Commands that repeat all of it, and result files committed to the repo.

**Out** (named in the report as later work):

- Any client or panel change. That is part 2.
- Written answers, and the tool-calling agent. After the diploma.
- Different chunk sizes, several embedding models, or a local LLM against the
  API model. Each would multiply the experiment.
- Automatic indexing on upload, and any screen for managing indexes.
- The user study.

## Schedule

**Revised 2026-10-11.** Part 1 did not start in September, so the first
schedule's eight weeks are now four. There is no spare week. Weeks start on
Monday.

| Week | Dates | Work |
|---|---|---|
| 1 | 12–18 Oct | #35 spine reader, the chunker, `add_book_from_file`, `load-corpus`, `corpus.csv`. **The chunker is frozen at the end of this week.** |
| 2 | 19–25 Oct | The 40 hand questions **first**, before any draft or result exists. Chunk tables, BM25 and embedding search, RRF, the metrics code, a smoke test. The DeepSeek client, and the prompt pilot on the 2 pilot books. |
| 3 | 26 Oct – 1 Nov | Descriptors for every chunk and every question. Drafting, and the review. **Freeze the protocol.** The full run and the statistics. |
| 4 | 2–8 Nov | The checked sample. The genre analysis. The practice report and slides. |
| — | 9–14 Nov | Practice defense |

The hand questions come first because a person who has seen which method wins
can write questions that favour it without noticing. They need only the frozen
chunker, so they can start on the first day of week 2.

**Needed from the author before week 2:** the 40 books and the 2 pilot books,
downloaded; a DeepSeek API key with a balance.

**If the work runs late**, these move to the thesis period (15 Nov – 6 Jan), in
this order. The application promises none of them:

1. The descriptor accuracy check ([validity check](#validity-checks) 5).
2. The [failure review](#failure-review).
3. H4, the question-kind analysis. The `kind` tag is still recorded, so it can
   be done later on the same data.

The checked sample *is* promised in the application. It moves only if the full
run itself is late, and then the practice report says so.

## Books

**Source: [Standard Ebooks](https://standardebooks.org), the "compatible
EPUB" download.** Not Project Gutenberg, for three reasons:

- Standard Ebooks marks every section the same way (`epub:type`): title page,
  colophon, chapter, endnotes. The chunker can reliably keep only the book's
  own text.
- Gutenberg files add licence text and differ in structure from book to book.
- Gutenberg blocks scripted downloads outside its harvest address.

**The files** came from the author's own libra library: the public shelf
"Diploma experiment pick", 42 Standard Ebooks files (40 test books and 2
pilot books), exported once through the API on 2026-10-11. No script touches
the Standard Ebooks site.

**Keeping the exact files.** Standard Ebooks corrects its books over time, so
the same link can later give a different file.

- `experiment/corpus.csv` lists every book: file name, `sha256`, title,
  author, genre, role (test or pilot) and link.
- `experiment/corpus-stats.csv` gives each book's word and chunk counts and
  its `chunks_sha256`.
- The genre is decided by hand. Standard Ebooks' own `z3998:fiction` and
  `z3998:non-fiction` tags are not reliable: *Disenchantment* is tagged
  fiction, and so is most of Dewey's *Human Nature and Conduct*.
- The 42 files go into one zip on the GitHub release `experiment-corpus-v1`.
  The repository is public and the files are CC0, so this is allowed. Anyone
  can repeat the run with the same files, and the `sha256` values show
  whether a file changed.

**Rules for choosing books:**

- 20 fiction, 20 non-fiction.
- Total word count per genre within 10% of the other. A bigger genre has more
  wrong passages to compete with, and that alone would lower its scores.
- No book over about 200,000 words, so no single book fills the index.
- **Prefer less famous books.** DeepSeek may know famous plots from training.
  When it turns a question into descriptors, it could describe the answer scene
  from memory, and the descriptor method would win for the wrong reason.
- **The genre rule.** The supervisor agreed the label "non-fiction"
  («нехудожественная литература»), not "popular science". Standard Ebooks has
  little pure popular science, and essays and philosophical or political works
  are not popular science.
  - **Fiction:** novels and short stories.
  - **Non-fiction:** books that explain or argue: science, history,
    philosophy, politics, essays.
  - **Not used:** poetry and plays, whose short lines and layout would chunk
    differently. Also not used: memoirs, biographies and travel books. They
    tell a story the way fiction does, and would blur the genre comparison
    (H3).
  - Each book's genre is written in `corpus.csv` before any question exists.
    The protocol repeats this rule.

**One index for all 40 books**, like the panel's "your library". Results are
reported by the genre of the question.

## Chunking

After #35 reads the spine:

1. Leave out the files labelled `frontmatter` or `backmatter` (title page,
   colophon, imprint, licence page, table of contents, endnotes) and the nav
   document. Keep everything else.
2. Turn XHTML into paragraphs with the existing guarded XML parsing.
3. Pack whole paragraphs into chunks of about **250–300 words**. The hard limit
   is **450 tokens, counted by the embedding model's own tokenizer**, so no
   chunk is ever cut short when it is embedded.
4. A chunk never crosses a chapter. Here a chapter is one spine item: every
   test book keeps one chapter per file. A paragraph over the limit is split
   at a sentence end, and a sentence over it is split between words.
5. **No overlap.** With overlap, one answer sits in two chunks, and "the
   correct chunk" stops being one chunk.

Chunk text is the paragraphs only. Headings, the chapter title, note
reference numbers and figures are left out; a line break inside a paragraph
becomes a space; a table row is one paragraph. Everything inside `<header>`
is left out too: Standard Ebooks puts chapter synopses, epigraphs and
datelines there, 1,174 words in the corpus. So is a `<cite>` line beside the
paragraphs of a quotation, 473 characters. A no-break space (U+00A0) stays in
the text: Standard Ebooks writes one after "Mr." and "St.", and it stops the
sentence split from cutting a name off its title. A chunk closes once it has
250 words, or earlier when the next paragraph would take it over 450 tokens.
A bodymatter file with only a heading in it, such as a part title page,
gives no chunk.

A book with no `epub:type` labels (not from Standard Ebooks) keeps every spine
item except the navigation document. The experiment does not need this, but
part 2 does.

The 40 test books give **9,476 chunks** with chunker version 1.

**Chunk identity** is the book's `sha256`, the chunk's position in the book,
and `CHUNKER_VERSION`. Changing the chunker raises the version and makes every
question label invalid. That is why the chunker is frozen in week 1, before any
question exists.

The boundaries also depend on the tokenizer, and `fastembed` downloads the
model's newest revision. So `experiment/corpus-stats.csv` keeps each book's
`chunks_sha256`, a hash of its chunk texts, and `index` and `evaluate` check
it. The protocol records the model revision the run used.

## Search

### Embedding model

**`BAAI/bge-base-en-v1.5`, run through `fastembed`.**

- `fastembed` uses ONNX Runtime, not PyTorch. It runs on the CPU, so the server
  and Docker need no GPU, and there is one code path everywhere.
- 768 dimensions, input limit 512 tokens, MIT licence. `fastembed` 0.9
  serves a quantized ONNX export, `Qdrant/bge-base-en-v1.5-onnx-Q`, of
  0.21 GB. Its vectors differ slightly from the original model's, so the
  protocol names this exact source.
- Citation: Xiao et al., "C-Pack", arXiv:2309.07597.
- Token counts come from `TextEmbedding.token_count`. They include the two
  special tokens the model adds to every input.
- Indexing every book takes minutes. One question takes milliseconds.
- Questions get the prefix
  `Represent this sentence for searching relevant passages: `. Chunks and
  descriptors get none. (v1.5 makes the prefix optional; the protocol fixes
  it.)
- All vectors fit in memory: about 9,500 chunk vectors and 76,000 descriptor
  vectors (8 per chunk), roughly 260 MB.

### Methods

| Name | How it ranks chunks |
|---|---|
| `bm25` | SQLite FTS5 with the `porter unicode61` tokenizer. `bm25()` uses SQLite's fixed k1 = 1.2 and b = 0.75. The question is split into words; each word is quoted and joined with `OR`. |
| `dense` | Cosine similarity between the question vector and each chunk's text vector, over every chunk |
| `descriptors` | For each query descriptor, its best cosine match among a chunk's descriptors; the chunk's score is the average of those best matches (MaxSim, as in ColBERT — Khattab & Zaharia, 2020) |
| `dense+descriptors` | RRF of `dense` and `descriptors`. **The supervisor's method:** the text space plus the descriptor space. |
| `bm25+dense` | RRF of `bm25` and `dense`. The usual hybrid baseline. |
| `all` | RRF of all three. An extra row, not a hypothesis. |

**RRF** (Cormack, Clarke & Büttcher, 2009): a chunk's score is
Σ 1 / (60 + rank), over each list's top 100.

**Why `bm25+dense` is in the table.** Merging any two decent rankings often
beats each of them alone. The supervisor's method must beat `bm25+dense`, not
only `dense`, or its gain may come from merging and not from descriptors.

**Why quoting.** `AND`, `OR`, `NOT` and `NEAR` are FTS5 operators, and `"` and
`*` are syntax. A question like "Why did NOT the captain…" must search for the
word, not run an operator.

**Search is exact.** Every chunk is scored. Approximate vector indexes can miss
true neighbours, and that would be a second cause for any difference between
methods.

### Descriptor procedure (protocol v1)

| Setting | Value |
|---|---|
| Model | `deepseek-v4-pro` (served as `DeepSeek-V4-Pro-0813`) |
| Thinking | off: `thinking: {type: "disabled"}` |
| Temperature | 0 |
| Output | JSON mode: `response_format: {type: "json_object"}` |
| Per chunk | **exactly 8** descriptors, each 2–6 words |
| Per question | **exactly 5** descriptors |
| Prompt input | **the chunk text only** — no title, no author |

- **Exactly 8**, because in MaxSim a chunk with more descriptors has more
  chances of a high match.
- **No title or author**, to lower the chance of DeepSeek describing the book
  from memory instead of the passage.
- **Every response is saved** to `experiment/descriptors.jsonl` (question
  descriptors to `experiment/query-descriptors.jsonl`): raw JSON, the
  `system_fingerprint`, prompt version, token usage and time. The API has no
  seed, so a second call can differ. **The evaluation only reads saved
  descriptors**; repeating it never calls the API.
- Empty or invalid output is retried up to 3 times, then recorded as a failure
  and counted in the report. DeepSeek's own docs say JSON mode "may
  occasionally return empty content".
- **The prompt is tuned on 2 pilot books that are not among the 40.** Tuning on
  test books would fit the prompt to them. The pilot also confirms JSON mode on
  `v4-pro`; the docs only show it with `deepseek-flash`.
- No batch API exists, so up to 8 requests run in parallel. A run resumes:
  chunks already saved are skipped. Runs happen off-peak (peak is 01:00–04:00
  and 06:00–10:00 UTC, Monday to Friday; off-peak costs half).

**Cost.** About $8–12 off-peak for all chunks, at DeepSeek's September 2026
prices ($0.66 per million input tokens and $1.98 per million output tokens,
off-peak). The pilot checks the prices and the model name again before the
full run.

## Test questions

Every question comes from **one known chunk**, its source chunk, and that chunk
is the correct answer.

### Two sets

| Set | Size | Written by | When |
|---|---|---|---|
| Hand | 40 (20 fiction, 20 non-fiction) | the author | Week 2, before any draft or result |
| Drafted | 10 per book = 400 drafts, about 300 kept | DeepSeek, then reviewed by the author | Week 3 |

For the hand set, `rag hand-question` shows a random chunk and the author
writes a question about it. That is the same pattern as the drafts, so the two
sets are comparable.

### Two kinds of question

Every question carries a tag:

- **factual** — who, what, where. "Where does the ship stop for water?"
- **interpretive** — why, feelings, ideas. "Why does the narrator distrust his
  brother?"

Drafts are 50/50. Interpretive questions have the widest gap between the
question's words and the text's words, which is exactly where descriptors
should help. Genre stays the main split; kind is the second.

### Choosing chunks for drafts

- Each book is cut into 10 equal parts, and one chunk is taken at random from
  each. The seed is recorded. This stops questions gathering in the first
  chapters.
- Chunks under 100 words are skipped, and so are chunks used by the hand set.

### Drafting rules

- The question must be answerable from this chunk alone.
- Names of people and places are allowed. Readers use them, and they make it
  clear which book a question means.
- **No other wording from the chunk.** A draft that shares a 4-word sequence
  with its chunk, names excluded, is drafted again.
- Output JSON: `question`, `kind`, a short `answer`, and a short `evidence`
  quote from the chunk. The quote makes review fast.

### Review

`rag review` shows each chunk with its draft: **keep**, **edit** or **drop**.
Keep a draft only if all of these hold:

1. It is answerable from this chunk alone.
2. A real reader could ask it.
3. It is clear which book it is about.
4. It does not reuse the chunk's wording.
5. The kind tag is right.

Every drop records a reason, and the report shows the counts. Budget: about
400 × 45 seconds ≈ 5 hours, in week 3.

### The weakness of one correct chunk

Another chunk may also answer a question — a fact repeated in chapter 20. A
method that finds that chunk is scored as wrong.

- **Main scores use the source chunk only.** This is the standard
  "known-item search" setup, and the report uses that name.
- **A checked sample.** After the full run: 50 random questions; the top 5
  chunks of every method; the author judges each unlabelled chunk relevant or
  not. About 600 judgements, 4–5 hours, in week 4. It measures how much the
  main scores under-count, and **whether the order of methods changes**.

### Bias checks on the drafts

For both sets: the share of a question's words that appear in its source
chunk. If drafts overlap much more than hand questions, the drafted set favours
BM25, and the report says so.

The final set is about 340 questions: about 170 per genre, about 85 per genre
and kind.

## Evaluation

### The protocol is frozen before the full run

In week 3, `experiment/protocol.md` is committed and tagged
`experiment-protocol-v1`. It records the `corpus.csv` hash, `CHUNKER_VERSION`,
the embedding model, the descriptor prompt and settings, the methods, k, the
metrics, the hypotheses and the tests. The tag shows the analysis was fixed
before the results existed. Any later change is listed in the report as a
deviation.

### Hypotheses

The main metric is **recall@10**.

| | Hypothesis | Comparison |
|---|---|---|
| H1 | Adding descriptors helps | `dense+descriptors` vs `dense` |
| H2 | The supervisor's method beats the usual hybrid | `dense+descriptors` vs `bm25+dense` |
| H3 | Descriptors help fiction more than non-fiction | H1's gain on fiction vs on non-fiction |
| H4 (secondary) | Descriptors help interpretive questions more than factual ones | H1's gain per kind |

**H1 and H2 are tested in each genre separately**, because the application
promises the main comparison and a separate analysis for each genre. So the
main family has five tests: H1 and H2 on fiction, H1 and H2 on non-fiction,
and H3. The expectation behind the method — descriptors help most where the
question's words differ from the text's, as in fiction — is H3.

A negative result is a valid result. The report answers each hypothesis with a
confidence interval, whatever the outcome.

### Metrics

With one correct chunk per question:

- **recall@k** (k = 5, 10): the share of questions whose source chunk is in the
  top k.
- **MRR@10**: 1 / (rank of the source chunk), or 0 outside the top 10, averaged.
- **precision@k is not a main metric.** With a single correct chunk it always
  equals recall@k ÷ k, so it adds no information. It is reported, with recall,
  on the 50-question checked sample, where a question can have several correct
  chunks.

### Statistics

- Every comparison is **paired**: the same questions, two methods, one
  difference per question.
- **95% confidence intervals** from a paired bootstrap, 10,000 resamples, fixed
  seed.
- **p-values** from a paired randomisation test. Both follow Smucker, Allan &
  Carterette (2007), "A comparison of statistical significance tests for
  information retrieval evaluation".
- **Holm correction** across the five main tests: H1 and H2 in each genre, and
  H3. H4 is secondary and outside the family.
- H3 compares gains between genres with a bootstrap of the difference.
- The report leads with intervals: "the gain is between −2 and +6 points" still
  says something when nothing is significant.

`scipy.stats.bootstrap` and `scipy.stats.permutation_test` do the resampling;
nothing is hand-written.

### Validity checks

All in the report:

1. **Hand set vs drafted set:** scores per set, and whether both order the
   methods the same way. The main results use both sets together.
2. **Word overlap** with the source chunk, per set.
3. **The checked sample:** does the order of methods change when every relevant
   chunk is marked?
4. **Descriptor failures:** how many chunks got no valid descriptors.
5. **Descriptor accuracy:** in 50 random chunks, each of the 8 descriptors is
   marked supported by the text or not. About 400 judgements, 1.5 hours. This
   is the rate of made-up descriptors.

### Failure review

For fiction: 20 questions where `descriptors` found the chunk and `dense` did
not, and 20 the other way round. Read them, group them by cause, describe the
groups — for example "the descriptor named the theme", "the descriptor made
something up", "a name-heavy question BM25 wins".

### What a run writes

`experiment/runs/<run-id>/`:

- `ranks.csv` — the rank of the source chunk, per question and method
- `summary.csv` and `summary.md` — the tables
- charts — recall@10 per method and genre, with intervals
- `run.json` — protocol version, git commit, `corpus.csv` hash

Ranking reads only saved data, so the same inputs always give the same numbers.

## Code

### Where it goes

| Place | Change |
|---|---|
| `app/epub.py` | #35: `read_spine`, `read_chapter`, with href confinement and member size caps |
| `app/library.py` | **`add_book_from_file`**, moved out of the `upload_book` route. The route and `rag load-corpus` both call it. [layering.md](layering.md) names this exact move: "when Phase 2 needs to ingest a file outside a request". |
| `app/models.py` | The tables below |
| `app/config.py` | `deepseek_api_key` (`SecretStr`), `embedding_model`, `model_cache_dir` |
| `app/cli.py` | A `rag` command group |
| `backend/rag/` | `chunking`, `embeddings`, `deepseek`, `descriptors`, `search`, `questions`, `evaluate`, `stats` |
| `experiment/` (repo root) | Data, not code: `corpus.csv`, `protocol.md`, `descriptors.jsonl`, `query-descriptors.jsonl`, `questions/`, `judgements/`, `runs/`. Like docs, it goes straight to `main`. |

`rag` imports from `app`. `app` imports `rag` only in `cli.py` now, and in
`librarian.py` in part 2.

### Tables

- `Chunk` — `book_id`, `position`, `spine_index`, `chapter_title`, `text`,
  `word_count`, `token_count`, `chunker_version`
- `chunk_fts` — FTS5, external content over `Chunk`, kept in step by three
  triggers (insert, delete, update), as the SQLite FTS5 documentation shows
- `ChunkVector` — `chunk_id`, `model`, `vector` (bytes)
- `Descriptor` — `chunk_id`, `position`, `text`, `prompt_version`, `vector`
  (bytes)

**FTS5 needs two special cases:**

1. The table and triggers are created in the migration, **and** by a SQLAlchemy
   `after_create` hook on `Chunk`. The test suite builds its schema with
   `SQLModel.metadata.create_all`, so without the hook tests would have no FTS5
   table.
2. `alembic/env.py` gains an `include_name` filter that ignores `chunk_fts*`.
   FTS5 creates hidden helper tables, and `test_models_and_migrations_agree`
   runs `alembic check`, which would otherwise try to drop them.

**`delete_book`** also deletes the book's descriptors, vectors and chunks, the
same way it already deletes tags, notes and reading state. The triggers clean
`chunk_fts`. As before, this matters because SQLite reuses ids: without it, the
next book uploaded would inherit the dead book's chunks.

**The descriptor log is the source of truth.** `rag import-descriptors` loads
`experiment/descriptors.jsonl` into a fresh database with no API calls.

### Why SQLite, not Chroma

[architecture.md](../architecture.md) planned Chroma. For 40 books, SQLite is
the better fit:

- One database. Deleting a book removes its chunks in the same transaction.
  With Chroma, a failed second delete leaves passages from a book that no
  longer exists.
- BM25 is built in (FTS5). Chroma would need a second library, `rank_bm25`,
  that rebuilds its index in memory at every start.
- Exact search removes approximate-index misses as a cause of differences.
- No `chromadb` dependency tree in the wheel and the Docker image.

The cost is scale. About 500 books with descriptors is roughly a million
vectors, over 1 GB in memory. A large library after the diploma needs a vector
index then (`sqlite-vec`, or Chroma). The chunk tables and `rag.search` stay as
they are.

### Commands

All are `uv run python -m app.cli rag <command>`:

| Command | Does |
|---|---|
| `load-corpus <corpus.csv> <folder>` | Checks every file's `sha256` against `corpus.csv`, then adds the 40 test books (not the pilot books) through `add_book_from_file`. Refuses a database that holds any other book, before migrating it. |
| `corpus-stats <corpus.csv> <folder> --out <file>` | Chunks every book and writes one row per book: words, chunks, the largest chunk in tokens, chunks under 100 words, and `chunks_sha256`. Exits 1 and names each corpus rule that breaks. |
| `index` | Chunks, fills FTS5, embeds chunk text. Skips books already indexed at this `CHUNKER_VERSION`. |
| `describe` | Descriptors for chunks that have none; appends to the log, imports into the database; resumes |
| `import-descriptors` | Loads the log into the database, no API |
| `hand-question` | Shows a random chunk; records the author's question and kind |
| `draft-questions` | Samples chunks, drafts questions, applies the 4-word check |
| `review` | Keep, edit or drop each draft, with a reason |
| `judge-pool` | The 50-question checked sample |
| `judge-descriptors` | The 50-chunk descriptor accuracy sample |
| `evaluate` | Runs every method over every question; writes a run folder |
| `report` | Statistics, tables and charts from a run |

### Dependencies

- **App** (in the wheel, needed by part 2 as well): `fastembed`, `numpy`,
  `openai` — the Python SDK DeepSeek's docs use; the API is OpenAI-compatible
  at `https://api.deepseek.com`.
- **`experiment` dependency group** (not in the wheel): `scipy`, `matplotlib`.
  CI runs `uv sync --all-groups`, so it installs and tests these too.

The PR that adds them changes `uv.lock`, so it gets the `arm64` dry-run build
of the release image ([architecture.md](../architecture.md#version-numbers)).
That shows early whether ONNX Runtime installs on `arm64`.

## Errors

| Case | Behaviour |
|---|---|
| No `deepseek_api_key` | The command stops before any work, and says which setting is missing |
| 401 (bad key), 402 (no balance) | The whole run stops at once. A retry cannot fix either. |
| 429, 5xx, timeout | Retried by the SDK |
| Empty or invalid JSON | Retried up to 3 times, then recorded as a failure |
| A crash mid-run | Nothing is lost: each response is written and flushed before the next request, and the next run skips finished chunks |
| A broken chapter file | `index`: that book is skipped with a message; the others go on. `corpus-stats`: it stops and names the book, because a broken corpus file is a corpus problem. |
| A `sha256` or `CHUNKER_VERSION` that differs from the question labels | `evaluate` refuses to run |

The API key never appears in a log line or an error message.

## Tests

- **Chunking:** `tests/epub_factory.py` learns to build chapters with
  `epub:type` labels (today its spine is empty). Tests: body text only; no
  chunk crosses a chapter; no overlap; the token limit; a long paragraph split
  at a sentence; the book without labels.
- **Hostile input:** an href escaping the archive; a DTD in a chapter; an
  oversized member.
- **FTS5:** stemming matches; quoting defuses `NOT` and `NEAR`; the
  `create_all` path has the table; `alembic check` passes; `delete_book` clears
  chunks, vectors, descriptors and FTS rows — **including when a new book
  reuses the id**.
- **A fake embedder** with fixed vectors in all ordinary tests. One test against
  the real model runs only with `LIBRA_TEST_MODELS=1`, so CI and the pre-push
  hook never download the model.
- **A fake DeepSeek client** that behaves like the real server: empty content,
  invalid JSON, 401, 429. Tests: retries, stopping, resuming without a second
  call, and the key absent from logs and errors.
- **Maths:** recall@k, MRR@10, RRF, MaxSim and Holm, each on a small case worked
  by hand. Tests import `K_VALUES` and the RRF constant rather than retyping
  them. Two evaluations of the same inputs give byte-identical output.
- Every guard is mutation-tested by hand: break it, watch a test fail, restore
  it.

## Risks to the results

| Risk | What handles it |
|---|---|
| DeepSeek knows famous books | Prefer less famous books; no title in the prompt; named in the report |
| One model writes the descriptors and drafts the questions | The hand set, and the comparison of both sets |
| Drafts copy the chunk's wording and favour BM25 | The 4-word check; word overlap reported per set |
| One correct chunk under-counts | The 50-question checked sample |
| "Non-fiction" is broader than popular science | The label is agreed with the supervisor |
| JSON mode on `v4-pro` is not documented | Confirmed in the week 2 pilot |
| The model or its price changed since September | The week 2 pilot checks both; the protocol records the model version that served the run |
| DeepSeek serves different output later | Every response saved; evaluation never calls the API |
| The schedule slips | No spare week is left. A fixed order of what moves to the thesis period, none of it promised in the application ([Schedule](#schedule)) |

---

# Part 2 — the librarian panel (sketch)

For 15 Nov – 6 Jan. Its own spec comes in November. Part 1 must leave it
ready:

- **`app/librarian.py` keeps its shape.** `generate_reply` stops producing
  canned text and calls `rag.search.search(session, question, method, k=3)`. The
  method is a setting, set to the experiment's winner. The router and the
  stream event types stay.
- **A reply carries a list of citations**, each with the book, the chapter title
  and a short excerpt. Messages already stored hold one `citation`; the client
  reads that as a list of one.
- **Client:** `MessageBubble` shows up to three quoted passages, each linked to
  its book. The stub badge goes.
- **No per-user filter on search.** Every user sees every book
  ([architecture.md](../architecture.md), Non-goals). Conversations are already
  per user.
- **Open for the part 2 spec:** index a new upload automatically? (Embeddings
  are cheap; descriptors cost API calls.) And when DeepSeek is down and the
  method needs query descriptors — fall back to `bm25+dense` and say so in the
  status line?
- **Also open: the model file in Docker.** The application claims
  Containerization, so search must work in the image too. The embedding model
  is a 0.21 GB file. Either the image contains it, or the container downloads
  it into the data volume on first use. The image is built for `amd64` and
  `arm64`.

# Open questions

- Part 2's three questions above.
- The supervisor has not seen the detailed genre rule in [Books](#books),
  written on 2026-10-11. He sees it with the technical assignment, before
  `corpus.csv` is final.

Settled since 2026-09-13: the label "non-fiction", agreed with the supervisor
in September.
