---
title: A Passage Retrieval System for an E-book Library Using LLM-Generated Semantic Descriptors
subtitle: Business Analysis Block — Introduction, Chapter 1 and Chapter 2
author: [TODO: Surname Name, as in the university records]
supervisor: [TODO: supervisor's title and full name]
programme: Informatics
type: Individual project
place: Vilnius, 2026
---

[[TOC]]

# Introduction

## Relevance and problem

Many readers keep a personal library of e-books in the EPUB format: books
bought without DRM, public-domain classics, files collected over years.
Library tools help them keep and read these books. They do not help them find
a *passage* again.

The problem is simple to state: **a reader remembers an idea from a book, but
not the words.** A reader recalls "the part where the captain doubts his own
orders", or "the argument that habits come before reasons". To find it, the
reader must guess the words the author used. Keyword search fails when the
question and the text use different words. This is the *vocabulary problem*:
people describe the same thing with different words far more often than
system designers expect [@furnas1987]. It is worst in fiction, where the text
shows a scene and never names the idea behind it.

The problem matters now for two reasons. First, text embedding models now run
on an ordinary CPU, so a self-hosted library can search by meaning without a
GPU. Second, large language models (LLMs) have become cheap enough to describe
every passage of a library. A recent technique asks an LLM to write short,
free-form *semantic descriptors* for each passage, such as "moral choice under
pressure", and searches over those descriptors [@willison2026]. For the 40
books of this project (about 2.5 million words in 9,476 passages) this costs an
estimated 8–12 USD. It is not known whether descriptors find the right passage
more often than the methods that exist today, and no e-book library offers
this kind of search ([Section 1.3](#13-analysis-of-analogs)).

The project builds this search for **Libra**, a self-hosted e-book library
web application that the author built before the diploma. Libra already
stores, organises and shows books, and sends them to a Kindle. Its search box
matches only the title, the author and tags; it cannot search the text of the
books at all. The diploma adds the missing part: a search module that finds
passages, and a "librarian" panel that shows them.

**One number that shows the scale:** [TODO: one number for slide 1. Best
option: the share of your 40 hand questions that BM25 does not find in its top
10 — known after the full run. Until then: "Libra holds 2.5 million words in
40 books, and none of them can be searched by content today".]

## Goal and objectives

**Goal:** to build and experimentally evaluate a passage retrieval system for
an e-book library that uses LLM-generated semantic descriptors, and to
integrate its best configuration into the Libra application.

**Objectives:** [TODO: confirm these with the supervisor.]

1. Analyse how readers find passages in personal e-book libraries today, and
   review existing tools and retrieval methods.
2. Specify the requirements for the search module and the librarian panel.
3. Build the search module: chunking of book text, BM25, text-embedding and
   descriptor search, and hybrid ranking with Reciprocal Rank Fusion.
4. Compare six search configurations on 40 public-domain books with
   Recall@5, Recall@10 and MRR@10, separately for fiction and non-fiction,
   with paired statistical tests.
5. Integrate the best configuration into the librarian panel, which shows the
   passages it finds.

## Object and subject

**Object:** the process of finding information in a personal e-book library —
how a reader goes from a remembered idea to the passage that contains it.

**Subject:** the automatable side of that process: passage retrieval over the
full text of the library, with LLM-generated semantic descriptors, and its
presentation in the library's user interface.

## Methods

- **Document analysis:** the EPUB 3.3 specification [@epub33], the format of
  Standard Ebooks files [@standardebooks], the diploma requirements and the
  approved topic application.
- **Benchmarking of analogs:** six existing tools were tried on the same tasks
  and compared on the same criteria ([Section 1.3](#13-analysis-of-analogs)).
- **Literature review:** retrieval methods and how they are evaluated
  ([Section 1.2](#12-review-of-sources)).
- **Analysis of the existing system:** Libra's code, data model and API, to
  find where the search module fits.
- **Consultations with the supervisor**, which set the scope of the
  experiment on 8 and 13 September 2026.
- **Experiment:** the requirements for the search method are checked by a
  controlled comparison of six configurations ([Section 2.10](#210-chapter-conclusions)).
- [TODO: a short **survey** of readers — "how do you find a passage you
  remember?" — gives evidence that the problem is real. Delete this item if
  you do not run one.]

# Chapter 1. Analytical part

## 1.1 Current state

### The existing system

Libra is a self-hosted web application for a household's e-book library,
built by the author before the diploma (versions 0.1.0 and 0.2.0). One server
holds the books and a SQLite database; every household member opens it in a
browser. It already provides:

- EPUB upload with metadata and cover extraction;
- a shared catalogue, with personal shelves, tags, ratings and notes;
- an in-browser reader for a computer, a tablet and a phone;
- sending a book to a Kindle by e-mail;
- accounts with roles (reader, administrator);
- a librarian panel: a chat screen whose replies are, for now, fixed text.

**These functions are not part of the diploma's new work.** They are the
platform that the new search module plugs into, and they set its constraints:
one server, no GPU, one SQLite database, a Docker image for `amd64` and
`arm64`.

### How a passage is found today

Libra's search box matches only the title, the author and `#tag` names. To
find a passage, a reader has to:

1. remember, or guess, which book holds the passage;
2. open that book in the reader — Libra's reader has no search inside the
   book — or in another app that can search one book by keyword;
3. guess the words the author used and search for them;
4. if nothing is found, try other words, then other books;
5. give up, or search the web.

Other library tools work the same way: they search one book at a time, by
keyword ([Section 1.3](#13-analysis-of-analogs)).

### Who is involved

| Role | Part in the process |
|---|---|
| Reader | Remembers an idea and wants the passage |
| Kindle owner | A reader who reads on a Kindle, where search covers only the open book |
| Household administrator | Runs the server; would have to index the books and pay for the LLM |

### Where time and data are lost

1. **The reader must know the author's words.** When the guess fails, there
   is no second strategy except reading. [TODO: one measured example: e.g.
   "finding 5 remembered passages with keyword search took on average N
   minutes, and 2 of 5 were not found".]
2. **The reader must know the book.** Search works inside one book at a
   time, so a question about the whole library has no tool.
3. **The book text is not used.** Libra stores 2.5 million words of text that
   no function can search.

[[FIGURE: as-is.png | AS-IS process: finding a remembered passage (UML activity)]]

### TO-BE process (short)

The reader types the question in their own words into the librarian panel.
The search module ranks every passage of every book, by keywords and by
meaning, and the panel shows the three best passages, each with its book and
chapter. One click opens the passage in Libra's reader. Which ranking method
the panel uses is decided by the experiment, not by guess.

## 1.2 Review of sources

The review covers four areas: keyword retrieval, dense retrieval, LLM-based
expansion of documents and queries, and the evaluation of retrieval.

**Keyword retrieval.** BM25 ranks documents by how often the query words
appear in them, weighted by how rare each word is and normalised by document
length [@robertson2009]. It needs no training and remains a strong baseline:
on the BEIR benchmark it beats many neural models on data unlike their
training data [@thakur2021]. Its weakness is the vocabulary problem: it gives
nothing to a passage that says the same thing in other words [@furnas1987].
*Conclusion:* BM25 is a baseline that every new method must beat.

**Dense retrieval.** Dense retrievers encode the question and each passage as
vectors and rank passages by vector similarity. Karpukhin et al. showed that
such a retriever beats BM25 on open-domain question answering
[@karpukhin2020], and retrieval-augmented generation builds answers on top of
it [@lewis2020]. Small general-purpose embedding models, such as the BGE
family [@xiao2023], now run on a CPU. *Conclusion:* text embeddings are the
second baseline, and the model must run locally on a CPU (NFR-03, NFR-07).

**LLM-based expansion.** Two lines of work add generated text to bridge the
vocabulary gap. Doc2query generates likely questions for each document before
indexing [@nogueira2019]. HyDE asks an LLM for a hypothetical answer and
searches with its embedding [@gao2023]. Semantic descriptors combine both
ideas: an LLM describes each passage and each question with short phrases,
and search compares the phrases [@willison2026]. Matching a set of query
phrases against a set of passage phrases is the late-interaction idea of
ColBERT, which scores each query token by its best match in the document
[@khattab2020]. Rankings from several methods are commonly merged with
Reciprocal Rank Fusion (RRF), which needs no tuning [@cormack2009].
*Conclusion:* descriptors are tested alone and merged with embeddings by RRF.
Because merging almost any two rankings helps, the descriptor hybrid must also
beat the usual BM25 + embeddings hybrid (KPI-1).

**Where the sources stop.** Doc2query and HyDE were tested on web and
Wikipedia collections, not on books, and BEIR shows that results on one kind
of text do not carry over to another [@thakur2021]. No source tests descriptors
on fiction, where the gap between a reader's words and the author's is widest.
An LLM may also know famous books from training and describe a passage from
memory. *Conclusion:* the experiment uses less famous books, keeps the title
out of the prompt (US-2.2), and reports fiction and non-fiction separately.

**Evaluation.** Recall@k and mean reciprocal rank (MRR) are the standard
measures when each question has one known correct passage [@thakur2021]. For
two systems run on the same questions, Smucker et al. recommend paired
randomisation tests and bootstrap intervals over the t-test or sign test
[@smucker2007]. *Conclusion:* the experiment reports Recall@5, Recall@10 and
MRR@10 with paired bootstrap intervals, randomisation tests and the Holm
correction (Epic E5).

**Requirements practice.** Chapter 2 follows the BABOK Guide for stakeholder
analysis and traceability [@babok], user stories in Cohn's form [@cohn2004],
and the ISO/IEC 25010 quality model for the non-functional requirements
[@iso25010]. Personal data and accessibility follow the GDPR [@gdpr] and
WCAG 2.1 [@wcag21].

## 1.3 Analysis of analogs

Six tools were compared on how they help a reader find a passage: four
library tools, one commercial reading service, and one self-hosted tool that
answers questions over uploaded documents. [TODO: try each one on the same
task — find 3 remembered passages in the same books — take screenshots, and
correct every cell marked "?".]

- **Calibre** [@calibre] — the standard desktop e-book manager.
- **Calibre-Web** [@calibreweb] — a self-hosted web interface over a Calibre
  library; the analog named in the topic application.
- **Kavita** [@kavita] — a self-hosted reading server.
- **Kindle** [@sendtokindle] — Amazon's reading devices and apps.
- **Google Play Books** [@playbooks] — a commercial service that accepts
  uploaded EPUB files.
- **AnythingLLM** [@anythingllm] — a self-hosted tool that answers questions
  over uploaded documents with an LLM.

[[TABLE: Comparison of analogs]]

| Criterion | Calibre | Calibre-Web | Kavita | Kindle | Google Play Books | AnythingLLM | Libra + new module |
|---|---|---|---|---|---|---|---|
| Search by title, author, tags | Yes | Yes | Yes | Yes | Yes | No | Yes |
| Keyword search in the book text | Yes, whole library | ? | ? | ? | One book | ? | Yes (BM25) |
| Search by meaning | No | No | No | No | No | Yes (embeddings) | Yes |
| Shows the source passage, with book and chapter | Yes (keyword hits) | ? | ? | Yes, one book | Yes, one book | Yes, as citations | Yes |
| Answer cannot be invented: only real passages are shown | Yes | Yes | Yes | Yes | Yes | No: writes its own answer | Yes |
| Search method measured on books | No | No | No | No | No | No | Yes (experiment) |
| Self-hosted, books stay at home | Yes | Yes | Yes | No | No | Yes | Yes |
| Part of an e-book library (reader, shelves, Kindle) | Yes | Yes | Yes | Yes | Yes | No | Yes |

[[FIGURE: analog-screens.png | Screenshots of the analogs during the test task]]

**What is missing.** The library tools search by keywords at best, so they
fail on the vocabulary problem. AnythingLLM searches by meaning, but it is not
a library, it writes its own answer — which, for well-known books, an LLM can
produce from memory without any passage — and its search method has never been
measured on books. No tool combines **search by meaning across a whole
library, real passages instead of generated answers, and a search method
chosen by measurement**. That is the gap the diploma fills.

## 1.4 Chapter conclusions

| ID | Problem | Epic | KPI |
|---|---|---|---|
| P1 | A passage cannot be found when the reader does not remember the author's words | E3 Passage search, E2 Descriptors | KPI-1, KPI-2 |
| P2 | Search works inside one book at a time; Libra cannot search book text at all | E1 Text indexing, E4 Librarian panel | KPI-2, KPI-3 |
| P3 | It is not known which method finds passages best, especially in fiction | E5 Retrieval experiment | KPI-1 |
| P4 | Tools that search by meaning write answers that cannot be checked | E4 Librarian panel | KPI-2 |
| P5 | Search by meaning must run on a home server without a GPU, at a low LLM cost | E1, E2 | KPI-3, KPI-4 |

**What the new solution must be able to do:** index the full text of every
book in the library; take a question in the reader's own words; rank every
passage by keywords and by meaning, with the method that the experiment shows
to be best; and show the real passages, with book and chapter, inside the
existing library application — on a CPU-only home server.

# Chapter 2. System requirements

## 2.1 Vision and goals

**Vision statement.** For readers who keep their own e-book library, the
Libra librarian finds the passage they are thinking of, even when they do not
remember the author's words. Unlike keyword search in Calibre or question
answering in AnythingLLM, it searches the whole library by meaning and shows
only real passages, ranked by a method chosen by experiment.

**Business goals.**

- **G1.** Let readers find a remembered passage by meaning, across the whole
  library.
- **G2.** Find out, with a reproducible experiment, whether LLM-generated
  descriptors improve passage retrieval, and in which genre.
- **G3.** Deliver the best method inside Libra, within its limits: one
  self-hosted server, no GPU, low running cost.

[[TABLE: Key performance indicators]]

| KPI | Measure | Baseline | Target | How it is measured |
|---|---|---|---|---|
| KPI-1 | Recall@10 of the panel's method on the test questions | Recall@10 of BM25 + embeddings in the same run [TODO: value after the run] | Higher than the baseline, with the 95% interval of the gain above 0 [TODO: or a number agreed with the supervisor] | `rag evaluate` and `rag report` on the frozen protocol |
| KPI-2 | Remembered passages found by a reader, out of 5 tasks | [TODO: found with keyword search, e.g. 2 of 5] | At least 4 of 5, each in under 1 minute | The same 5 tasks, timed, in the librarian panel |
| KPI-3 | Search response time, 95th percentile | None: Libra cannot search book text | ≤ 2 s on the 40-book library | Timer around `rag.search`, 100 questions |
| KPI-4 | LLM cost to index the 40-book library | — (new function) | ≤ 15 USD | Token usage saved with every LLM response |

## 2.2 Stakeholders and users

[[TABLE: Stakeholders]]

| Stakeholder | Interest | Influence |
|---|---|---|
| Reader | Find a passage without its exact words; trust what is shown | M |
| Kindle owner | Find the passage, then read it on the device; the device's search covers one book only | L |
| Household administrator | Index the library once; low cost; no reader data leaves home without consent | H |
| Researcher (the author) | A valid, repeatable comparison of the methods | H |
| Diploma supervisor | A sound experiment and a working demo; agrees the scope | H |
| Diploma committee and experts | The criteria of the topic application are met | H |
| DeepSeek (LLM provider) | API usage under its terms | L |
| Standard Ebooks (book source) | Correct use of its CC0 books | L |

[[FIGURE: stakeholder-matrix.png | Influence/interest matrix]]

**System users (actors):** Reader, Household administrator and Researcher.
External systems: the DeepSeek API and the embedding model, which runs inside
the server.

**Persona 1 — Mark, the reader who remembers ideas.** Mark is 52 and reads
history, philosophy and classic novels. He often remembers an argument or a
scene, but never the sentence. Last month he spent half an hour looking for a
passage about habits and character, and did not find it. He wants to type
"the part about habits coming before reasons" and see the passage — and he
wants to see the book's own words, not a summary.

**Persona 2 — Anna, the household administrator.** Anna is 38, works in IT
and runs Libra on a small home server with about 600 books. She will turn the
new search on only if indexing runs on the CPU she has, costs a few dollars,
and does not send her family's questions to an outside company without her
choice.

## 2.3 Project scope

**In scope (new in the diploma):**

- Chunking the text of each EPUB into passages of about 250–300 words.
- An index of the chunks: BM25 (SQLite FTS5), text vectors from a local
  embedding model, and LLM-written descriptors with their vectors.
- Six search configurations: BM25, embeddings, descriptors, and three RRF
  hybrids.
- The retrieval experiment: 40 public-domain books, hand-written and
  LLM-drafted test questions with review, metrics, statistics and a report.
- The librarian panel shows the top three passages of the best configuration,
  each opening the book at its chapter.
- Search in the Docker image (`amd64` and `arm64`), including the embedding
  model.

**Out of scope:**

- Libra's existing functions — upload, catalogue, shelves, tags, notes, the
  reader, Kindle delivery, accounts. They exist and are not changed, except
  where the panel links to the reader.
- Answers written by an LLM, and a tool-calling librarian agent.
- Other chunk sizes, other embedding models, a local LLM for descriptors.
- Approximate vector indexes for very large libraries.
- A user study (removed from the diploma on 13 September 2026).

[[TABLE: Assumptions and constraints]]

| Type | Statement |
|---|---|
| Constraint (deadline) | The experiment is finished for the practice defense on 9–14 Nov 2026; the panel works for the pre-defense on 6–9 Jan 2027 |
| Constraint (resources) | One developer; a CPU-only server; an LLM budget of about 10–20 USD |
| Constraint (platform) | The module lives inside Libra: one FastAPI server, one SQLite database, one Docker image |
| Assumption (data) | Standard Ebooks files are CC0 and stay available; the exact 42 files are kept on a GitHub release with their `sha256` |
| Assumption (API) | The DeepSeek API stays available with JSON output at about the September 2026 price; every response is saved, so the evaluation never calls it again |

## 2.4 Solution concept

The search module is a new part of Libra's server, in the `rag` package. It
reads the chapters of each EPUB, splits them into chunks, and stores the
chunks in the same SQLite database as the books. For each chunk it stores
three things: an entry in a BM25 full-text index (SQLite FTS5), a text vector
from the embedding model `bge-base-en-v1.5`, which runs on the CPU, and eight
descriptors written once by an external LLM, with their vectors. A question
gets its own vector and five descriptors, and each method ranks every chunk;
RRF merges the rankings of a hybrid. Libra's existing librarian endpoint calls
the search and streams the top three passages to the panel. The same code runs
the experiment, so the numbers in the report describe the system in the demo.

[[FIGURE: context.png | Context diagram]]

[[TABLE: Alternatives considered for the search index]]

| Criterion | A. Separate vector database (Chroma) | B. Everything in Libra's SQLite (chosen) |
|---|---|---|
| Deleting a book | Two stores; a failed second delete leaves passages of a deleted book | One transaction removes the book and its chunks |
| BM25 | Needs a second library that rebuilds its index at every start | Built in (FTS5) |
| Search accuracy | Approximate index can miss true neighbours | Exact search: every chunk is scored |
| Dependencies and image size | Extra service and dependency tree | None beyond the embedding library |
| Scale | Millions of vectors | About 1 million vectors (≈ 500 books) before a vector index is needed |

**Rationale.** Option B was chosen. For a household library it is simpler and
safer, and exact search removes approximate-index misses as a second cause of
differences between the methods. Its limit, about 500 books with descriptors,
is recorded as a constraint for after the diploma.

## 2.5 Functional requirements

### Epics

| ID | Epic | Goal | Priority |
|---|---|---|---|
| E1 | Book text indexing | G1, G3 | Must |
| E2 | Semantic descriptors | G1, G2 | Must |
| E3 | Passage search | G1 | Must |
| E4 | Librarian panel shows passages | G1, G3 | Must |
| E5 | Retrieval experiment | G2 | Must |

The full backlog of 20 user stories, with acceptance criteria in
Given/When/Then form, is in Appendix A. The key stories are below.

### Key user stories

**US-4.1 (Must).** As a reader, I want to ask a question in my own words, so
that I can find a passage without remembering the author's words.

- *Given* the library is indexed, *when* I send a question in the librarian
  panel, *then* I see up to three passages, each with the book title, the
  chapter title and an excerpt.
- *Given* a search is running, *when* I wait, *then* the panel shows that it
  is searching, and the passages appear within 2 seconds (NFR-01).
- *Given* no passage matches, *when* the search ends, *then* the panel says
  so, and shows no invented text.

**US-4.2 (Must).** As a reader, I want to open a found passage in the book, so
that I can read it in context.

- *Given* a passage in the results, *when* I select it, *then* Libra's reader
  opens that book at that chapter.

**US-3.3 (Should).** As a reader, I want search to work when the LLM is not
available, so that I can still find passages.

- *Given* the LLM API does not answer within 10 seconds, *when* I ask a
  question, *then* the search uses BM25 + embeddings, and the panel says that
  a simpler search was used.

**US-2.2 (Must).** As the researcher, I want descriptors written from the
passage text only, so that the LLM describes the passage and not a book it
remembers.

- *Given* a chunk, *when* descriptors are requested, *then* the prompt holds
  no title and no author, and exactly 8 descriptors of 2–6 words are saved.

**US-5.4 (Must).** As the researcher, I want one command to evaluate every
configuration, so that the results can be repeated.

- *Given* the frozen protocol and the saved descriptors, *when* I run
  `rag evaluate`, *then* the rank of the source chunk is written for every
  question and configuration, and a second run gives byte-identical files.

[TODO: layouts for 3–4 key stories, from a scratch instance
(`scripts/run.ps1 -Scratch`): (1) the librarian panel with three passages —
draw it over today's panel if part 2 is not built yet; (2) the "nothing found"
state; (3) the reader opened at a passage; (4) the fallback notice of US-3.3.
Add them as figures.]

### Traceability

| Goal | KPI | Epic | Stories |
|---|---|---|---|
| G1 Find passages by meaning | KPI-1, KPI-2 | E1, E2, E3, E4 | US-1.1 – US-4.4 |
| G2 Measure whether descriptors help | KPI-1 | E2, E5 | US-2.1 – US-2.4, US-5.1 – US-5.5 |
| G3 Deliver inside Libra's limits | KPI-3, KPI-4 | E1, E4 | US-1.3, US-1.4, US-4.3, US-4.4 |

## 2.6 Use case scenarios

[[FIGURE: use-cases.png | Use case diagram]]

### UC-1. Find a passage by question

| Field | Content |
|---|---|
| Actor | Reader |
| Precondition | The reader is logged in. The books are indexed, with descriptors. |
| Postcondition | The question and the passages are saved in the reader's conversation. |

**Main flow:**

1. The reader opens the librarian panel, types a question and sends it.
2. The system saves the question in the reader's conversation.
3. The system asks the LLM for five descriptors of the question.
4. The system ranks all chunks with the configured method and takes the top
   three.
5. The system streams the reply: three passages, each with the book, the
   chapter and an excerpt.
6. The reader selects a passage, and the reader opens the book at that
   chapter.

**Alternative flows:**

- **3a. The LLM does not answer.** After 10 seconds the system ranks with
  BM25 + embeddings, which need no LLM, and says so. Continue at step 5.
- **4a. Nothing matches.** The system says that no passage was found and
  suggests other words. The use case ends.

### UC-2. Index the library

| Field | Content |
|---|---|
| Actor | Household administrator (or the researcher, for the test corpus) |
| Precondition | The books are in Libra. The LLM API key is set in the server settings. |
| Postcondition | Every chunk has a BM25 entry, a text vector and 8 descriptors. |

**Main flow:**

1. The administrator runs `rag index`.
2. The system splits each book into chunks and stores them with their BM25
   entries and text vectors, one book per transaction.
3. The administrator runs `rag describe`.
4. The system asks the LLM for 8 descriptors per chunk, up to 8 requests at a
   time, and appends each response to the descriptor log before the next.
5. The system reports the number of chunks, the failures and the cost.

**Alternative flows:**

- **4a. The key is wrong or the balance is empty.** The system stops at once
  and names the problem; nothing is retried.
- **4b. The run stops halfway.** The next run skips the chunks that already
  have descriptors, so nothing is paid twice.

[[FIGURE: sequence-uc1.png | System sequence diagram for UC-1]]

## 2.7 Non-functional requirements

[[TABLE: Non-functional requirements]]

| ID | Category | Requirement and measure | Linked to |
|---|---|---|---|
| NFR-01 | Performance | Search answers in ≤ 2 s at the 95th percentile on the 40-book library (9,476 chunks, about 76,000 descriptor vectors), on a 4-core CPU | KPI-3, US-4.1 |
| NFR-02 | Performance | Text indexing of the 40 books takes ≤ 30 min on the same CPU | US-1.2 |
| NFR-03 | Capacity | All vectors of the 40-book library fit in ≤ 1 GB of memory | KPI-3 |
| NFR-04 | Cost | Descriptors for the 40-book library cost ≤ 15 USD | KPI-4, US-2.1 |
| NFR-05 | Security | The LLM API key never appears in a log line or an error message (checked by a test) | US-2.3 |
| NFR-06 | Privacy | Search follows Libra's existing rules: each reader sees only their own conversation (another's returns 404) | US-4.1 |
| NFR-07 | Availability | Search works without the LLM API, with BM25 + embeddings | US-3.3 |
| NFR-08 | Portability | The Docker image runs search on `linux/amd64` and `linux/arm64`, with the embedding model available | US-4.4 |
| NFR-09 | Usability | The panel meets WCAG 2.1 level AA and works at a width of 360 px | US-4.1, US-4.2 |
| NFR-10 | Reproducibility | Two evaluations of the same saved inputs give byte-identical result files | KPI-1, US-5.4 |

## 2.8 Legal and ethical requirements

**Personal data.** The new module adds one kind of personal data: the
questions a reader asks, saved in their conversation. When a household runs
Libra for its own members, the processing is a purely personal or household
activity, which the GDPR does not cover (Art. 2(2)(c)) [@gdpr]. The module
still follows its principles: each reader's conversation is private, and
nothing about a reader is sent out without the administrator's choice.

**Data sent to a third party.** To get descriptors for a question, the module
sends the question to the DeepSeek API, which processes data outside the EU.
A question may contain personal data. Therefore the administrator must be able
to turn the LLM off (search then uses BM25 + embeddings), and the panel must
say that questions are sent to an external service. Book text sent for
descriptors is public domain, and no personal data is sent with it.

**Consent of participants.** No interviews or surveys with other people were
conducted; the test questions were written or reviewed by the author. [TODO:
replace with the consent text if you run the survey: anonymous, agreement on
the first screen, no names or e-mail addresses, answers used only for this
thesis.]

**Licences.**

| Component | Licence |
|---|---|
| Test books (Standard Ebooks) | CC0 [@standardebooks] |
| Embedding model `bge-base-en-v1.5` | MIT |
| `fastembed` library | Apache 2.0 [TODO: check] |
| DeepSeek API | Provider's terms of service |
| Libra, including the new module | MIT |

**Standards.** The panel follows WCAG 2.1 level AA [@wcag21] (NFR-09); the
quality requirements follow the ISO/IEC 25010 model [@iso25010].

## 2.9 Risks

[[TABLE: Project risks]]

| ID | Risk | Probability | Impact | Mitigation | Dependency |
|---|---|---|---|---|---|
| R1 | Descriptors do not beat the baselines | M | M | A negative result is valid; every hypothesis is answered with an interval; the panel uses the best method found | Experiment results |
| R2 | The schedule slips: no spare week before the practice defense | H | H | A fixed order of work that moves to the thesis period; nothing promised in the topic application moves | University deadlines |
| R3 | The LLM provider changes the model, the price or the JSON output | M | M | A pilot checks both before the full run; every response is saved; the protocol records the model version | DeepSeek API |
| R4 | The LLM knows famous books and describes the answer from memory | M | H | Less famous books; no title or author in the prompt; named in the report | Book choice |
| R5 | One correct chunk per question under-counts correct results | H | M | A 50-question sample where every relevant chunk is judged by hand | Test questions |
| R6 | The embedding model does not run, or runs too slowly, on `arm64` | L | M | `arm64` test build on every dependency change | Docker, ONNX Runtime |

**Top 3 risks for the defense:** R4, R2 and R1.

## 2.10 Chapter conclusions

The specification fixes: three goals and four KPIs; eight stakeholders and
three actors; a scope that contains only the new search module, the
experiment and the panel, with Libra's existing functions as the platform;
five epics and 20 user stories with priorities and acceptance criteria; two
use case scenarios; ten measurable non-functional requirements; the legal
basis for the new personal data; and six risks.

The result is verified against the KPIs of Section 2.1:

- **KPI-1** — by the experiment protocol, frozen before the final run:
  Recall@10 of the panel's method against BM25 + embeddings, with a 95%
  paired bootstrap interval, separately for fiction and non-fiction.
- **KPI-2** — by timing five passage-finding tasks with keyword search and
  with the panel.
- **KPI-3** — by timing 100 searches on the 40-book library.
- **KPI-4** — by the token usage saved with every LLM response.

The acceptance criteria of every Must story are checked by automated tests
and by the demo at the pre-defense.

# List of references

[[REFERENCES]]

# Appendix A. Backlog

[[TABLE: Full backlog]]

| ID | Epic | User story | Acceptance criteria | MoSCoW |
|---|---|---|---|---|
| US-1.1 | E1 | As the system, I want each book split into chunks of whole paragraphs, so that one chunk is one passage a reader can read | Given an EPUB, when it is chunked, then only body chapters are used, no chunk crosses a chapter, no chunks overlap, and none is over 450 tokens. | Must |
| US-1.2 | E1 | As an administrator, I want one command to index the library, so that its text can be searched | Given books without chunks, when I run `rag index`, then each book's chunks, BM25 entries and vectors are stored in one transaction, and indexed books are skipped. | Must |
| US-1.3 | E1 | As an administrator, I want a deleted book's chunks removed with it, so that search never shows a book that is gone | Given an indexed book, when it is deleted, then its chunks, vectors and descriptors are removed, also when a new book later reuses its id. | Must |
| US-1.4 | E1 | As an administrator, I want new uploads indexed for search, so that every book can be found | Given a new upload, when indexing finishes, then its passages are found by BM25 and by embeddings. | Could |
| US-2.1 | E2 | As an administrator, I want descriptors written for every chunk, so that search by descriptors works | Given chunks without descriptors, when I run `rag describe`, then each gets exactly 8 descriptors, and failures are counted after 3 retries. | Must |
| US-2.2 | E2 | As the researcher, I want descriptors written from the passage text only, so that the LLM describes the passage, not a book it remembers | See Section 2.5. | Must |
| US-2.3 | E2 | As an administrator, I want every LLM response saved, so that a crash or a rerun never pays twice | Given a crash during `rag describe`, when I run it again, then finished chunks are skipped and no saved response is lost; the API key appears in no log. | Must |
| US-2.4 | E2 | As the researcher, I want the descriptor prompt tuned on books outside the test set, so that the prompt is not fitted to the test | Given the 2 pilot books, when the prompt is tuned, then no test book is used, and the final prompt is recorded in the protocol. | Must |
| US-3.1 | E3 | As a reader, I want passages ranked by BM25, embeddings and descriptors, so that each kind of match can be found | Given a question, when it is searched with each single method, then every chunk is scored and the top k are returned. | Must |
| US-3.2 | E3 | As a reader, I want rankings merged with RRF, so that the strengths of several methods add up | Given two or three rankings, when they are merged, then each chunk scores Σ 1/(60 + rank) over each list's top 100. | Must |
| US-3.3 | E3 | As a reader, I want search to work when the LLM is unavailable, so that I can still find passages | See Section 2.5. | Should |
| US-4.1 | E4 | As a reader, I want to ask a question in my own words, so that I can find a passage without its exact words | See Section 2.5. | Must |
| US-4.2 | E4 | As a reader, I want to open a found passage in the book, so that I can read it in context | See Section 2.5. | Must |
| US-4.3 | E4 | As an administrator, I want to choose the search method in the settings, so that the panel uses the experiment's winner | Given a method set in the settings, when a reader asks, then that method ranks the chunks. | Should |
| US-4.4 | E4 | As an administrator, I want search to work in the Docker image, so that I can run it on my server | Given the image on `amd64` or `arm64`, when a reader asks a question, then passages are returned. | Must |
| US-5.1 | E5 | As the researcher, I want to write hand questions before any result exists, so that the questions do not favour one method | Given the frozen chunker, when I run `rag hand-question`, then I see a random chunk and record a question and its kind. | Must |
| US-5.2 | E5 | As the researcher, I want LLM-drafted questions reviewed one by one, so that only valid questions are used | Given a draft, when I review it, then I keep, edit or drop it, and a drop records its reason. | Must |
| US-5.3 | E5 | As the researcher, I want the protocol frozen and tagged before the full run, so that the analysis cannot follow the results | Given the protocol, when it is committed, then it is tagged `experiment-protocol-v1` before any final result exists. | Must |
| US-5.4 | E5 | As the researcher, I want one command to evaluate every configuration, so that the results can be repeated | See Section 2.5. | Must |
| US-5.5 | E5 | As the researcher, I want intervals and tests for each hypothesis, so that the conclusions are sound | Given a run, when I run `rag report`, then each hypothesis has a 95% bootstrap interval and a Holm-corrected p-value, per genre. | Must |

# Appendix B. Diagrams

[[FIGURE: as-is.png | AS-IS process: finding a remembered passage (UML activity), full size]]
[[FIGURE: context.png | Context diagram, full size]]
[[FIGURE: use-cases.png | Use case diagram, full size]]
[[FIGURE: sequence-uc1.png | System sequence diagram for UC-1, full size]]

# Statements

**Use of AI.** [TODO: state honestly which tools you used and for what. For
example: "Claude (Anthropic) was used to draft the structure and a first
version of the text from the project's own documentation; the author checked
every statement against the code and the sources and rewrote the text. DeepSeek
is part of the method under study (descriptors and draft questions), as
described in Section 2.4." The requirements give a grade of 1–4 for
AI-generated text that is not declared.]

**Project type.** Individual project; no table of contributions is needed.

**Organisation's consent.** The project is not done for an organisation and
uses no organisation's data. The test books are public-domain texts from
Standard Ebooks.
