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

**Libra** is a self-hosted e-book library that the author built before the
diploma. Its planned main feature is the **Librarian**, an AI assistant that a
reader asks about their own library: "Who is this man the author describes?",
"Which of my books has an idea similar to this chapter?", "What else do I own
in this style?".

Such assistants use *retrieval-augmented generation* (RAG): the system first
retrieves the passages that relate to the question, and a large language model
(LLM) writes the answer from them [@lewis2020]. The answer is only as good as
the retrieval. When retrieval misses the passage, the LLM answers from what it
remembers from training, and the reader cannot tell.

This already happens in practice. Calibre, the standard open-source e-book
manager, added AI features in 2025: a reader can discuss a book with an LLM,
or ask about a selected piece of text [@calibrewhatsnew]. But the model
receives only the book's title, authors and description, or the selected
text — never the rest of the book. It is told to answer from what it knows
about the book, and to say that the book is unknown if it does not know it
[@calibrellm]. So it shows no source, and for a reader's less known books it
has no answer at all.

**The problem: it is not known which retrieval technique finds the right
passages for the questions readers ask about books.** RAG tools use text
embeddings by default, chosen by convention, not measured on books. Yet book
questions are hard: the reader's words differ from the author's. Two people
choose the same word for the same thing less than 20% of the time — the
*vocabulary problem* [@furnas1987] — and fiction shows ideas without naming
them. A new technique targets this gap: an LLM writes short *semantic
descriptors* for every passage, such as "moral choice under pressure", and
search compares descriptors [@willison2026]. It has not been measured on
books.

The problem matters now because the Librarian is Libra's next stage, and its
retrieval layer must be chosen first. The techniques are also practical on a
home server: embeddings run on a CPU, and describing the 9,476 passages of
this project's 40 books costs about 8–12 USD. The diploma builds the
retrieval part of the Librarian, compares six configurations in a controlled
experiment, and shows the best one's passages in the Librarian panel. Answers
written from the passages come after the diploma.

## Goal and objectives

**Goal:** to choose, by a controlled experiment, the retrieval technique for
the RAG pipeline of Libra's Librarian — building a passage retrieval system
with LLM-generated semantic descriptors and comparing it with keyword,
embedding and hybrid retrieval.

**Objectives:** [TODO: confirm these with the supervisor.]

1. Analyse what retrieval the Librarian needs, and review existing AI reading
   assistants and retrieval methods.
2. Specify the requirements for the retrieval module and for showing its
   results in the Librarian panel.
3. Build the retrieval module: chunking of book text, BM25, text-embedding and
   descriptor search, and hybrid ranking with Reciprocal Rank Fusion.
4. Compare six retrieval configurations on 40 public-domain books with
   Recall@5, Recall@10 and MRR@10, separately for fiction and non-fiction and
   for factual and interpretive questions, with paired statistical tests.
5. Connect the best configuration to the Librarian panel, which shows the
   passages it retrieves.

## Object and subject

**Object:** the Librarian feature of Libra — answering a reader's questions
about their own library with retrieval-augmented generation.

**Subject:** the retrieval step of that feature: finding the passages of the
library's books that answer a question, with LLM-generated semantic
descriptors and the methods they are compared with.

## Methods

Document analysis of the EPUB 3.3 specification [@epub33], Standard Ebooks
files [@standardebooks] and Libra's design documents; analysis of Libra's code
and API; benchmarking of analogs ([Section 1.3](#13-analysis-of-analogs)); a
literature review ([Section 1.2](#12-review-of-sources)); consultations with
the supervisor, who set the scope of the experiment. The experiment itself is not a method of this analysis: Chapter 2
specifies it, and it is run after the business analysis is approved.

# Chapter 1. Analytical part

## 1.1 Current state

### The existing system

Libra is a self-hosted web application for a household's e-book library,
built by the author before the diploma (versions 0.1.0 and 0.2.0). One server
holds the books and a SQLite database; every household member opens it in a
browser. It already provides EPUB upload with metadata extraction, a shared
catalogue with personal shelves, tags, ratings and notes, an in-browser
reader for a computer, a tablet and a phone, sending books to a Kindle, and
accounts with an administrator role.

**These functions are not part of the diploma's new work.** They are the
platform the retrieval module plugs into, and they set its constraints: one
server, no GPU, one SQLite database, a Docker image for `amd64` and `arm64`.

### The Librarian today

The Librarian already has its screen: a chat panel beside the library, with
one conversation per reader, saved on the server and streamed back word by
word. Its replies are fixed text, because nothing behind the panel can read
the books yet. Libra's search box matches only the title, the author and
tags; no function in Libra reads the text of a book.

The planned Librarian is an agent with a few tools [@libraarch]:

| Tool | What it does | What it needs from retrieval |
|---|---|---|
| `search_library` | Finds books and passages for a question | Passages from the whole library |
| `answer_about_book` | Answers a question about one book | Passages from that book |
| `recommend_similar` | Suggests books like the current one | Passages or books similar in idea or style |

Every tool depends on the same step: given a question, find the right
passages. That step is what the diploma builds and measures.

### Who is involved

| Role | Part in the process today |
|---|---|
| Reader | Has a question about a book; finds the answer alone, or not at all |
| Kindle owner | A reader on a Kindle, where search covers only the open book |
| Household administrator | Runs the server; will have to index the books and pay for the LLM |
| Author as developer of the Librarian | Must choose the retrieval technique before building the Librarian on it |

### How a reader gets an answer today

Without the Librarian, a reader with a question about a book has to:

1. remember, or guess, which book holds the answer;
2. open the book in a reader app that can search one book by keyword —
   Libra's reader has no search inside the book;
3. guess the words the author used and search for them;
4. if nothing is found, try other words, then other books;
5. give up, ask a general chatbot — which answers from memory, if it knows the
   book at all — or search the web.

[[FIGURE: as-is.png | AS-IS process: a reader looks for the answer to a question about a book (UML activity)]]

### How retrieval is chosen today

RAG tools and tutorials usually split documents into chunks, store text
embeddings in a vector database, and retrieve by vector similarity. The
choice is a default. It is rarely measured on the user's kind of text, and
almost never on fiction, where the gap between the question's words and the
author's words is widest ([Section 1.2](#12-review-of-sources)).

### Where time and quality are lost

1. **The reader must know the author's words and the book.** Keyword search
   in one book at a time fails on questions about ideas. [TODO: one measured
   example, e.g. "5 questions about the test books: keyword search found the
   passage for N of them, in M minutes on average".]
2. **AI tools answer from memory.** A general chatbot cannot see the
   reader's books, and Calibre's AI sees only a book's metadata or the
   selected text. Their answers cannot be checked against the text.
3. **A Librarian built on an unmeasured retriever inherits its misses.** If
   the retriever misses the passage, the LLM writes an answer without it, and
   the reader cannot tell.

### TO-BE process (short)

The reader asks the Librarian in their own words. The retrieval module ranks
every passage of every book with the configuration that the experiment will choose,
and returns the best passages. **In the diploma**, the Librarian panel shows
these passages, with book and chapter, so retrieval can be seen and checked on
its own. **After the diploma**, an LLM writes the answer from the same
passages, and the agent uses the same retrieval in each of its tools.

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
[@karpukhin2020]. Retrieval-augmented generation puts an LLM on top of such a
retriever: the LLM answers from the retrieved passages, so a passage the
retriever misses cannot be used at all [@lewis2020]. Small general-purpose
embedding models, such as the BGE family [@xiao2023], now run on a CPU.
*Conclusion:* text embeddings are the second baseline, the model must run
locally on a CPU (NFR-03, NFR-07), and retrieval is measured on its own,
before any answer is generated.

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
memory. *Conclusion:* the experiment will use less famous books, keep the
title out of the prompt (US-2.2), and report results separately for fiction
and non-fiction, and for the two kinds of question the Librarian will get:
*factual* ("who is this man?") and *interpretive* ("which chapter has a
similar idea?").

**Evaluation.** Recall@k and mean reciprocal rank (MRR) are the standard
measures when each question has one known correct passage [@thakur2021]. For
two systems run on the same questions, Smucker et al. recommend paired
randomisation tests and bootstrap intervals over the t-test or sign test
[@smucker2007]. *Conclusion:* the experiment will report Recall@5, Recall@10 and
MRR@10 with paired bootstrap intervals, randomisation tests and the Holm
correction (Epic E5).

**Requirements practice.** Chapter 2 follows the BABOK Guide for stakeholder
analysis and traceability [@babok], user stories in Cohn's form [@cohn2004],
and the ISO/IEC 25010 quality model for the non-functional requirements
[@iso25010]. Personal data and accessibility follow the GDPR [@gdpr] and
WCAG 2.1 [@wcag21].

## 1.3 Analysis of analogs

No existing product is both a personal e-book library and an AI assistant over
the reader's own books. The analogs therefore come from two groups:

- **A. Personal e-book library managers** keep and show the reader's own,
  side-loaded books:
  - **Calibre** [@calibre] — the standard desktop e-book manager; since 2025
    it has optional AI features [@calibrewhatsnew];
  - **Calibre-Web** [@calibreweb] — a self-hosted web interface over a Calibre
    library; the analog named in the topic application;
  - **Kavita** [@kavita] — a self-hosted reading server.
- **B. AI assistants over the user's own documents** answer questions with
  RAG:
  - **AnythingLLM** [@anythingllm] — open source and self-hosted;
  - **NotebookLM** [@notebooklm] — a commercial Google service that answers
    only from the documents the user uploads, with citations.

Store-centred products, such as Google Play Books and Kindle features like
X-Ray [@kindlexray], were left out. They are built around books bought in the
store, not around a library of the reader's own files, which is what Libra
holds. [TODO: ask each tool the same 3 questions about the same books — one
"who is this character", one "where is this idea", one "similar books" — take
screenshots, and correct every cell marked "?".]

[[TABLE: Comparison of analogs]]

| Criterion | Calibre (A) | Calibre-Web (A) | Kavita (A) | AnythingLLM (B) | NotebookLM (B) | Libra |
|---|---|---|---|---|---|---|
| Keeps and manages the reader's own EPUB files | Yes | Yes | Yes | No | No | Yes |
| Accepts EPUB files as a source for questions | No: the AI gets only metadata or the selected text | — | — | ? | Yes | Yes |
| Answers questions about the content of books | Yes, from the LLM's memory of the book, or about selected text | No | No | Yes | Yes, only from the uploaded sources | Passages now; answers after the diploma |
| Works across the whole library | Keyword search; the AI discusses only selected books, by metadata | Yes, metadata search only | ? | Yes, one workspace | One notebook, limited number of sources  | Yes |
| Retrieval by meaning, not only by keywords | No: the AI does no retrieval | No | No | Yes (embeddings) | Yes (method not published) | Yes (embeddings + descriptors) |
| Shows the source passages | Keyword hits; AI answers show none | No | ? | As citations | As citations | Yes, with book and chapter |
| Retrieval technique measured on books | No | No | No | No | Not published | Planned (the experiment) |
| Self-hosted; books and questions stay at home | Yes; local LLMs possible | Yes | Yes | Yes | No | Yes (LLM optional) |

[[FIGURE: analog-screens.png | Screenshots of the analogs answering the test questions]]

**What is missing.** Group A manages the reader's books. Calibre-Web and
Kavita cannot answer a question about them; at best they search by keywords.
Calibre now answers, but its model never sees the text of the book: it
answers from memory, shows no source, and cannot find a passage the reader
does not already have open. Group B answers
questions, but it is not a library: the books must be uploaded again into a
separate tool, and NotebookLM keeps them and the questions in Google's cloud.
Neither group uses a retrieval technique measured on books — and when
retrieval misses, an LLM may answer from memory, and the reader cannot tell.
No product offers **an assistant inside the reader's own library whose
retrieval was chosen by measurement on books**, for factual and interpretive
questions. The diploma builds and measures that retrieval; the assistant is
built on it after the diploma.

## 1.4 Chapter conclusions

| ID | Problem | Epic | KPI |
|---|---|---|---|
| P1 | The Librarian's answers will depend on a retrieval technique that nobody has measured on books | E5 Retrieval experiment | KPI-1 |
| P2 | Interpretive questions do not share words with the text (the vocabulary problem), most of all in fiction | E2 Descriptors, E3 Retrieval | KPI-1, KPI-2 |
| P3 | Libra cannot read the text of its books; there is no retrieval layer for the Librarian to call | E1 Text indexing, E3 Retrieval | KPI-3 |
| P4 | An answer whose passages are not shown cannot be checked by the reader | E4 Librarian panel | KPI-2 |
| P5 | Retrieval must run on a home server without a GPU, at a low LLM cost | E1, E2 | KPI-3, KPI-4 |

**What the new solution must be able to do:** index the full text of every
book in the library; take a question in the reader's own words; rank every
passage with the technique that the experiment will show to be best, for factual
and interpretive questions; return the passages, with book and chapter,
through one call that the Librarian's future tools can use; and show them in
the Librarian panel today — on a CPU-only home server.

# Chapter 2. System requirements

## 2.1 Vision and goals

**Vision statement.** For readers who keep their own e-book library, the Libra
Librarian is an AI assistant that answers questions about their books from the
books' own text. This diploma builds its foundation: a retrieval layer whose
technique will be chosen by an experiment on books, and which shows the
passages it finds in the Librarian panel. Unlike Calibre's AI, which answers
from the model's memory of a book, or assistants with a default retriever,
such as AnythingLLM, the Librarian will answer from passages found by a
technique measured on books.

**Business goals.**

- **G1.** Choose the Librarian's retrieval technique by a reproducible
  experiment on books, by genre and by question kind — including whether
  LLM-generated descriptors help.
- **G2.** Give the future Librarian one retrieval call that all its tools can
  use.
- **G3.** Make retrieval visible to readers now: the Librarian panel shows the
  passages, within Libra's limits (one server, no GPU, low cost).

[[TABLE: Key performance indicators]]

| KPI | Measure | Baseline | Target | How it is measured |
|---|---|---|---|---|
| KPI-1 | Recall@10 of the panel's method on the test questions | Recall@10 of BM25 + embeddings, the usual hybrid, measured on the same questions in the same run | Higher than the baseline: the 95% paired bootstrap interval of the difference lies above 0 | `rag evaluate` and `rag report` on the frozen protocol |
| KPI-2 | Reader-style questions (5 factual, 5 interpretive) whose answer passage is in the panel's top 3 | [TODO: found with keyword search in Calibre, e.g. 4 of 10] | At least 7 of 10 | The same 10 questions about the test books, asked in the panel |
| KPI-3 | Retrieval response time, 95th percentile | None: Libra cannot read book text | ≤ 2 s on the 40-book library | Timer around `rag.search`, 100 questions |
| KPI-4 | LLM cost to index the 40-book library | — (new function) | ≤ 15 USD | Token usage saved with every LLM response |

## 2.2 Stakeholders and users

[[TABLE: Stakeholders]]

| Stakeholder | Interest | Influence |
|---|---|---|
| Reader | Answers about their own books that can be checked against the text | M |
| Kindle owner | Ask about the book they read on the device, which gives no such help | L |
| Household administrator | Index the library once; low cost; no reader data leaves home without consent | H |
| Author as developer of the Librarian | A retrieval layer chosen on evidence, behind one stable call | H |
| Author as researcher | A valid, repeatable comparison of the techniques | H |
| Diploma supervisor | A sound experiment and a working demo; agrees the scope | H |
| Diploma committee and experts | The criteria of the topic application are met | H |
| DeepSeek (LLM provider) | API usage under its terms | L |
| Standard Ebooks (book source) | Correct use of its CC0 books | L |

[[FIGURE: stakeholder-matrix.png | Influence/interest matrix]]

**System users (actors):** Reader, Household administrator, Researcher, and
— after the diploma — the Librarian agent, which calls retrieval from its
tools. External systems: the DeepSeek API and the embedding model, which runs
inside the server.

**Persona 1 — Mark, the reader who forgets the details.** Mark is 52 and
reads long novels over weeks, along with history and philosophy. Halfway
through a book he meets a name and asks himself "who is this man again?". He
often remembers an idea but not the book, and wonders which other books he
owns say something similar. He wants to ask in his own words and see the
book's own text as proof, not a summary that may be made up.

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
- One retrieval call, `search(question, method, k)`, that returns passages
  with book and chapter, for the panel now and the Librarian's tools later.
- The Librarian panel shows the top three passages of the best configuration,
  each opening the book at its chapter.
- Search in the Docker image (`amd64` and `arm64`), including the embedding
  model.

**Out of scope:**

- Libra's existing functions — upload, catalogue, shelves, tags, notes, the
  reader, Kindle delivery, accounts. They exist and are not changed, except
  where the panel links to the reader.
- The rest of the Librarian, planned after the diploma: answers written by
  an LLM from the passages, the tool-calling agent, and recommendations of
  books by style.
- Other chunk sizes, other embedding models, a local LLM for descriptors.
- Approximate vector indexes for very large libraries.

[[TABLE: Assumptions and constraints]]

| Type | Statement |
|---|---|
| Constraint (deadline) | The experiment's results are ready for its expert assessment, which must happen before the pre-defense; the panel works for the pre-defense on 6–9 Jan 2027 |
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
RRF merges the rankings of a hybrid. The module exposes one call,
`search(question, method, k)`. Libra's existing Librarian endpoint calls it
and streams the top three passages to the panel; after the diploma, the
Librarian's answer step and agent tools call the same function. The same code
runs the experiment, so the numbers in the report describe the system in the
demo.

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
| E1 | Book text indexing | G2, G3 | Must |
| E2 | Semantic descriptors | G1 | Must |
| E3 | Retrieval (configurations and the retrieval call) | G1, G2 | Must |
| E4 | Librarian panel shows passages | G3 | Must |
| E5 | Retrieval experiment | G1 | Must |

The full backlog of 21 user stories, with acceptance criteria in
Given/When/Then form, is in Appendix A. The key stories are below.

### Key user stories

**US-2.2 (Must).** As the researcher, I want descriptors written from the
passage text only, so that the LLM describes the passage and not a book it
remembers.

- *Given* a chunk, *when* descriptors are requested, *then* the prompt holds
  no title and no author, and exactly 8 descriptors of 2–6 words are saved.

**US-3.3 (Should).** As a reader, I want search to work when the LLM is not
available, so that I can still find passages.

- *Given* the LLM API does not answer within 10 seconds, *when* I ask a
  question, *then* the search uses BM25 + embeddings, and the panel says that
  a simpler search was used.

**US-3.4 (Must).** As the developer of the Librarian, I want one retrieval
call with the method and the number of passages as arguments, so that every
future tool of the agent uses the same, measured retrieval.

- *Given* an indexed library, *when* `search(question, method, k)` is called
  with any of the six configurations, *then* it returns at most `k` passages,
  each with the book, the chapter, the text and the score, best first.

**US-4.1 (Must).** As a reader, I want to ask the Librarian a question in my
own words, so that I see the passages of my books that answer it.

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
| G1 Choose retrieval by experiment | KPI-1, KPI-2 | E2, E3, E5 | US-2.1 – US-2.4, US-3.1 – US-3.2, US-5.1 – US-5.5 |
| G2 One retrieval call for the Librarian | KPI-3 | E1, E3 | US-1.1 – US-1.4, US-3.3, US-3.4 |
| G3 Retrieval visible in the panel | KPI-2, KPI-3, KPI-4 | E4 | US-4.1 – US-4.4 |

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
| R2 | The schedule slips: the experiment, the panel and the thesis text all fall between the BA defense and the pre-defense | H | H | A fixed order of optional analyses to drop first if time runs short; nothing promised in the topic application is dropped | University deadlines |
| R3 | The LLM provider changes the model, the price or the JSON output | M | M | A pilot checks both before the full run; every response is saved; the protocol records the model version | DeepSeek API |
| R4 | The LLM knows famous books and describes the answer from memory | M | H | Less famous books; no title or author in the prompt; named in the report | Book choice |
| R5 | One correct chunk per question under-counts correct results | H | M | A 50-question sample where every relevant chunk is judged by hand | Test questions |
| R6 | The embedding model does not run, or runs too slowly, on `arm64` | L | M | `arm64` test build on every dependency change | Docker, ONNX Runtime |

## 2.10 Chapter conclusions

The specification fixes: three goals and four KPIs; eight stakeholders and
three actors; a scope that contains only the Librarian's retrieval layer, the
experiment and the panel, with Libra's existing functions as the platform
and the rest of the Librarian left for after the diploma;
five epics and 21 user stories with priorities and acceptance criteria; two
use case scenarios; ten measurable non-functional requirements; the legal
basis for the new personal data; and six risks.

The result is verified against the KPIs of Section 2.1:

- **KPI-1** — by the experiment protocol, frozen before the final run:
  Recall@10 of the panel's method against BM25 + embeddings, with a 95%
  paired bootstrap interval, separately for fiction and non-fiction.
- **KPI-2** — by asking the same ten reader-style questions with keyword
  search and in the panel.
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
| US-1.1 | E1 | As the researcher, I want each book split into chunks of whole paragraphs, so that each chunk is one passage that a question can be answered from | Given an EPUB, when it is chunked, then only body chapters are used, no chunk crosses a chapter, no chunks overlap, and none is over 450 tokens. | Must |
| US-1.2 | E1 | As an administrator, I want one command to index the library, so that its text can be searched | Given books without chunks, when I run `rag index`, then each book's chunks, BM25 entries and vectors are stored in one transaction, and indexed books are skipped. | Must |
| US-1.3 | E1 | As an administrator, I want a deleted book's chunks removed with it, so that search never shows a book that is gone | Given an indexed book, when it is deleted, then its chunks, vectors and descriptors are removed, also when a new book later reuses its id. | Must |
| US-1.4 | E1 | As an administrator, I want new uploads indexed for search, so that every book can be found | Given a new upload, when indexing finishes, then its passages are found by BM25 and by embeddings. | Could |
| US-2.1 | E2 | As an administrator, I want descriptors written for every chunk, so that search by descriptors works | Given chunks without descriptors, when I run `rag describe`, then each gets exactly 8 descriptors, and failures are counted after 3 retries. | Must |
| US-2.2 | E2 | As the researcher, I want descriptors written from the passage text only, so that the LLM describes the passage, not a book it remembers | See Section 2.5. | Must |
| US-2.3 | E2 | As an administrator, I want every LLM response saved, so that a crash or a rerun never pays twice | Given a crash during `rag describe`, when I run it again, then finished chunks are skipped and no saved response is lost; the API key appears in no log. | Must |
| US-2.4 | E2 | As the researcher, I want the descriptor prompt tuned on books outside the test set, so that the prompt is not fitted to the test | Given the 2 pilot books, when the prompt is tuned, then no test book is used, and the final prompt is recorded in the protocol. | Must |
| US-3.1 | E3 | As the researcher, I want passages ranked by BM25, by embeddings and by descriptors, so that each method can be compared on the same questions | Given a question, when it is searched with each single method, then every chunk is scored and the top k are returned. | Must |
| US-3.2 | E3 | As the researcher, I want rankings merged with RRF, so that the hybrids can be compared with the single methods | Given two or three rankings, when they are merged, then each chunk scores Σ 1/(60 + rank) over each list's top 100. | Must |
| US-3.3 | E3 | As a reader, I want search to work when the LLM is unavailable, so that I can still find passages | See Section 2.5. | Should |
| US-3.4 | E3 | As the developer of the Librarian, I want one retrieval call with the method and the number of passages as arguments, so that every future agent tool uses the same, measured retrieval | See Section 2.5. | Must |
| US-4.1 | E4 | As a reader, I want to ask the Librarian a question in my own words, so that I see the passages of my books that answer it | See Section 2.5. | Must |
| US-4.2 | E4 | As a reader, I want to open a found passage in the book, so that I can read it in context | See Section 2.5. | Must |
| US-4.3 | E4 | As an administrator, I want to choose the search method in the settings, so that the panel uses the experiment's winner | Given a method set in the settings, when a reader asks, then that method ranks the chunks. | Should |
| US-4.4 | E4 | As an administrator, I want search to work in the Docker image, so that I can run it on my server | Given the image on `amd64` or `arm64`, when a reader asks a question, then passages are returned. | Must |
| US-5.1 | E5 | As the researcher, I want to write hand questions before any result exists, so that the questions do not favour one method | Given the frozen chunker, when I run `rag hand-question`, then I see a random chunk and record a question and its kind. | Must |
| US-5.2 | E5 | As the researcher, I want LLM-drafted questions reviewed one by one, so that only valid questions are used | Given a draft, when I review it, then I keep, edit or drop it, and a drop records its reason. | Must |
| US-5.3 | E5 | As the researcher, I want the protocol frozen and tagged before the full run, so that the analysis cannot follow the results | Given the protocol, when it is committed, then it is tagged `experiment-protocol-v1` before any final result exists. | Must |
| US-5.4 | E5 | As the researcher, I want one command to evaluate every configuration, so that the results can be repeated | See Section 2.5. | Must |
| US-5.5 | E5 | As the researcher, I want intervals and tests for each hypothesis, so that the conclusions are sound | Given a run, when I run `rag report`, then each hypothesis has a 95% bootstrap interval and a Holm-corrected p-value, per genre. | Must |

# Appendix B. Diagrams

[[FIGURE: as-is.png | AS-IS process: a reader looks for the answer to a question about a book (UML activity), full size]]
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
