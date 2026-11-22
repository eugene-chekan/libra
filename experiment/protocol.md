# Experiment protocol v1

This protocol fixes the whole experiment before any result exists: the books,
the chunks, the search methods, the descriptor procedure, the questions, the
metrics, the hypotheses and the statistics.

- **Frozen on:** 2026-11-22, by the git tag `experiment-protocol-v1`.
- **Frozen before:** any test-book chunk was sent to DeepSeek, any question was
  drafted, and any method was run on a test question. Before this date only the
  2 pilot books were sent to DeepSeek (`pilot/notes.md`).
- **Changes after the freeze** are deviations. Each one is listed in the report
  with its date and its reason. The one planned addition is the drafting
  prompt; see "The drafted set" below.

The reasons behind each choice are in `docs/specs/phase-2-plan.md`. This file
states the choices only.

## 1. The question the experiment answers

Do LLM-written semantic descriptors help find the passage that answers a
reader's question in a library of books? The comparison is against BM25, text
embeddings, and the usual hybrid of the two, on 40 public-domain books, with
results split by genre.

## 2. The books

| What | Value |
|---|---|
| Book list | `experiment/corpus.csv`, sha256 `208c07b631d20d643bd196599e6ad0968708466a7f3ed2aaba84e84c4b8a5faa` |
| Test books | 40: 20 fiction, 20 non-fiction |
| Pilot books | 2, used only to tune the descriptor prompt: *Mike* (fiction), *Essays* by Malatesta (non-fiction). Never searched, never asked about. |
| Source | Standard Ebooks, "compatible EPUB"; each file's sha256 is in `corpus.csv` |
| Files | The GitHub release `experiment-corpus-v1`, `corpus-v1.zip`, sha256 `5f15b95eeda2f8f4eaf6a9e9f676b9db6131f40fa2b54411b8710f38fb02e822` |
| Words | 1,317,373 fiction and 1,199,794 non-fiction: a gap of 9.8% (the rule allows 10%) |

**The genre rule.** Fiction is novels and short stories. Non-fiction is books
that explain or argue: science, history, philosophy, politics, essays. Poetry,
plays, memoirs, biographies and travel books are not used. Each book's genre
was written in `corpus.csv` before any question existed.

## 3. The chunks

| What | Value |
|---|---|
| `CHUNKER_VERSION` | 1 |
| Chunk size | Whole paragraphs, closed at 250 words or more, never over 450 tokens |
| Overlap | None |
| Boundaries | A chunk never crosses a spine item (a chapter) |
| Tokenizer | The embedding model's own, `TextEmbedding.token_count`, which counts the 2 special tokens |
| Chunks | 9,476 in the 40 test books |
| Chunk hashes | `experiment/corpus-stats.csv`, sha256 `f9fef7cf89db323067fbba55e6d63c4723b43eacd89b4407f16eaa18886f0da2`; its `chunks_sha256` column is checked by `rag index` and `rag evaluate` |
| Chunk identity | The book's sha256, the chunk's position in the book, and `CHUNKER_VERSION` |

What a chunk holds, and what it leaves out, is in the plan's "Chunking"
section, as the code of `CHUNKER_VERSION` 1 does it.

## 4. The embedding model

| What | Value |
|---|---|
| Model | `BAAI/bge-base-en-v1.5`, 768 dimensions |
| Exact source | The quantized ONNX export `Qdrant/bge-base-en-v1.5-onnx-Q`, revision `199291fdd1aa89faf9c20b722dc72ad5e17aa0d0`, through `fastembed` 0.9.0 |
| Vectors | float32, unit length |
| A question | Gets the prefix `Represent this sentence for searching relevant passages: ` |
| A chunk | No prefix |
| A descriptor, of a chunk or of a question | No prefix: descriptors are matched with descriptors, short text with short text |

## 5. The methods

Every method scores **every** chunk of the 40 books; no search is approximate.
Each returns its first 100 chunks.

| Method | How it ranks chunks |
|---|---|
| `bm25` | SQLite FTS5, tokenizer `porter unicode61`, `bm25()` with SQLite's fixed k1 = 1.2 and b = 0.75. The question is split into words (letters, digits and `_`). Each word is quoted, and the words are joined with `OR`. A word that appears twice in the question is in the query twice. |
| `dense` | Cosine similarity of the question vector with each chunk's text vector |
| `descriptors` | MaxSim: for each of the question's 5 descriptors, its best cosine with the chunk's 8 descriptors; the chunk's score is the mean of those 5 best values |
| `dense+descriptors` | RRF of `dense` and `descriptors`. **The method under test.** |
| `bm25+dense` | RRF of `bm25` and `dense`. The usual hybrid, the baseline the method must beat. |
| `all` | RRF of all three. Reported, but no hypothesis is about it. |

- **RRF:** a chunk scores Σ 1 / (60 + rank) over each list's first 100 chunks,
  with ranks from 1.
- **Ties**, in every method, go to the lower chunk id. Chunk ids are given by
  `rag index`, which stores the books in `corpus.csv` order and each book's
  chunks in reading order.
- **A chunk with no valid descriptors** (its answer failed, see section 6) has
  no `descriptors` score. It is not in the `descriptors` list, and it can still
  be found through `dense` in the hybrids.
- **A question with no valid descriptors** gets an empty `descriptors` list. It
  counts as a miss for `descriptors`, and its hybrids use the other lists only.

## 6. The descriptors

| Setting | Value |
|---|---|
| Model | `deepseek-v4-pro`, the name the API reports. The log keeps each answer's `system_fingerprint`; the pilot saw `d400d062347a13495558bb956f2a0a0c`. |
| API | `https://api.deepseek.com`, through the `openai` Python SDK 3.51.0 |
| Thinking | Off: `thinking: {type: "disabled"}` |
| Temperature | 0 |
| Output | JSON mode, `response_format: {type: "json_object"}`, at most 300 tokens |
| Per chunk | Exactly 8 descriptors, each 2–6 words |
| Per question | Exactly 5 descriptors, each 2–6 words |
| Input | The chunk text or the question only: no title, no author |
| Prompt version | v1 (`PROMPT_VERSION` in `backend/rag/descriptors.py`) |
| Retries | An answer that is not JSON of the right shape is asked for again, up to 3 requests in all; then it is logged as `failed`. The SDK itself retries a failed connection up to 5 times, with a 120 s timeout. |
| Parallel requests | At most 8 at once (`rag describe`) |
| Time of day | Off-peak only: not 01:00–04:00 or 06:00–10:00 UTC, Monday to Friday |
| Cost limit | $10 for the whole experiment (KPI-3, NFR-04). Estimate for the chunks: about $4.5 off-peak. Prices are checked on the day of the run, and the log is compared with DeepSeek's usage report after it. |

**The chunk prompt v1**, word for word (sha256 of the text
`cbac8c9856dfcf6a0bab54c82461f7fdd90ca2dc48ffe353d6cd36c47e8fa1d9`):

```text
You write descriptors for a search index of book passages. Read the passage and write exactly 8 descriptors of what it is about: its themes, situations, actions, feelings and ideas. Each descriptor is 2 to 6 words. Describe only what this passage says or shows. Do not use names of people or places, and do not guess which book it is from. Answer in json, exactly in this form, with your 8 descriptors in place of the dots:
{"descriptors": ["...", "...", "...", "...", "...", "...", "...", "..."]}
```

**The question prompt v1**, word for word (sha256
`3dd5679b8330a9c262490d4ef7cbdf37106527f8d9d1c298e165021329b4907d`):

```text
You write descriptors for a search index of book passages. Read the reader's question and write exactly 5 descriptors of what it asks about: its themes, situations, actions, feelings and ideas. Each descriptor is 2 to 6 words. Describe only what the question itself asks. Do not use names of people or places, and do not use anything you know about a person, place or book that the question names. Answer in json, exactly in this form, with your 5 descriptors in place of the dots:
{"descriptors": ["...", "...", "...", "...", "..."]}
```

**The logs are the source of truth.** Chunk descriptors go to
`experiment/descriptors.jsonl`, and question descriptors to
`experiment/query-descriptors.jsonl`. Each line holds the raw answer, the model
name, the `system_fingerprint`, the prompt version, the tokens (with the cached
ones), the time and the number of requests. The evaluation reads only these
logs and never calls the API, so it gives the same numbers every time.

## 7. The questions

Every question comes from **one known chunk**, its source chunk. That chunk is
the only correct answer in the main scores ("known-item search").

Every question has a **kind**:

- **factual:** who, what, where;
- **interpretive:** why, feelings, ideas.

### The hand set

- 40 questions, one for each test book: 20 fiction and 20 non-fiction; 19
  factual and 21 interpretive.
- Written by the author with `rag hand-question` from 2026-10-20 to
  2026-11-16, before any draft or search result existed.
- `experiment/questions/hand.jsonl`, sha256
  `084432f52ce74f0acebf8e57afb86156ee6c827ef64065dc9353e8f15bf58a8e`: 42
  records, 40 kept and 2 skipped chunks with their reasons.

### The drafted set

- **Chunks:** each test book is cut into 10 equal parts by chunk position, and
  one chunk is taken at random from each part, with the seed `drafts-v1`.
  Chunks under 100 words are skipped, and so are the source chunks of the hand
  set. That gives 400 chunks.
- **Drafting:** DeepSeek `deepseek-v4-pro`, with the settings of section 6,
  writes one question for each chunk, as JSON: `question`, `kind`, a short
  `answer`, and a short `evidence` quote from the chunk. The 400 drafts are
  half factual and half interpretive.
- **Rules for a draft:** it can be answered from this chunk alone; names of
  people and places are allowed; no other wording from the chunk. A draft that
  shares a 4-word sequence with its chunk, names left out, is drafted again.
- **The drafting prompt** is written and committed, with its sha256 added to
  this file, before the first draft is asked for. It may only carry out the
  rules above. This is the one planned addition to protocol v1.
- **Review:** the author keeps, edits or drops each draft with `rag review`. A
  draft is kept only if it can be answered from this chunk alone, a real reader
  could ask it, it is clear which book it is about, it does not reuse the
  chunk's wording, and its kind is right. Every drop records a reason. About
  300 drafts are expected to be kept.

### The question set of the main results

Both sets together: about 340 questions, about 170 for each genre.

## 8. The metrics

- **recall@10, the main metric:** the share of questions whose source chunk is
  in a method's first 10.
- **recall@5**, the same in the first 5.
- **MRR@10:** the mean of 1 / (rank of the source chunk), where a rank past 10,
  or no rank, counts 0.
- precision@k is not a main metric: with one correct chunk it is always
  recall@k ÷ k. It is reported on the checked sample only (section 11).

## 9. The hypotheses

All on recall@10:

| | Hypothesis | Comparison |
|---|---|---|
| H1 | Adding descriptors helps | `dense+descriptors` vs `dense` |
| H2 | The method beats the usual hybrid | `dense+descriptors` vs `bm25+dense` |
| H3 | Descriptors help fiction more than non-fiction | H1's gain on fiction vs H1's gain on non-fiction |
| H4 (secondary) | Descriptors help interpretive questions more than factual ones | H1's gain on interpretive vs on factual questions |

H1 and H2 are tested on fiction and on non-fiction separately. The main family
is five tests: H1 fiction, H1 non-fiction, H2 fiction, H2 non-fiction, and H3.
A negative result is a valid result.

## 10. The statistics

- **Paired:** every comparison of two methods uses the same questions, with
  one difference for each question.
- **95% confidence intervals:** a paired bootstrap of the mean difference,
  10,000 resamples, `scipy.stats.bootstrap`.
- **p-values:** a paired randomisation test, 10,000 permutations,
  `scipy.stats.permutation_test`, two-sided. Both follow Smucker, Allan &
  Carterette (2007).
- **H3:** the difference between the two genres' H1 gains. The bootstrap
  resamples the questions of each genre separately, 10,000 times; the
  randomisation test shuffles the genre labels.
- **Holm correction** over the five main tests, at α = 0.05. H4 is outside
  the family and is not corrected.
- **Seed:** 20261122 for every resampling.
- The report gives each hypothesis an interval, whatever the p-value.

## 11. The checks reported with the results

1. **Hand set vs drafted set:** the scores of each set, and whether both
   order the methods the same way.
2. **Word overlap:** the share of a question's words that are in its source
   chunk, for each set.
3. **The checked sample:** 50 random questions; the first 5 chunks of every
   method; the author judges each chunk that is not the source chunk as
   relevant or not. It shows how much the main scores under-count, and whether
   the order of methods changes.
4. **Descriptor failures:** how many chunks and questions got no valid
   descriptors.
5. **Descriptor accuracy:** in 50 random chunks, the author marks each of the
   8 descriptors as supported by the text or not.
6. **The failure review:** for fiction, 20 questions that `descriptors` found
   and `dense` did not, and 20 the other way round, grouped by cause.

If the schedule slips, checks 5 and 6 and H4 move to the thesis period, in that
order. The report then says so.

## 12. What a run records

`rag evaluate` writes `experiment/runs/<run-id>/`:

- `ranks.csv`: the rank of the source chunk, for each question and method;
- `summary.csv` and `summary.md`: the tables;
- charts of recall@10 for each method and genre, with intervals;
- `run.json`: the protocol version, the git commit, and the sha256 of
  `corpus.csv`, `corpus-stats.csv`, the question files and the two descriptor
  logs.

## 13. Software

Measured on 2026-11-22: Python 3.13.12, SQLite 3.50.4, `fastembed` 0.9.0,
`onnxruntime` 1.31.0, `numpy` 2.5.4, `openai` 3.51.0. Every library version is
fixed by `backend/uv.lock`. `run.json` records the commit, and with it the
lock file, that produced each run.
