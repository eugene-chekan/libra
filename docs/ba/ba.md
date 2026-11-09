---
title: A Passage Retrieval System for an E-book Library Using LLM-Generated Semantic Descriptors
subtitle: Business Analysis Block — Introduction, Chapter 1 and Chapter 2
author: Chekan Yauheni
supervisor: Assoc. Prof. Audeychik Sergei, Candidate of Technical Sciences (PhD)
programme: Informatics
type: Individual project
place: Vilnius, 2026
file: BA_Chekan_Yauheni.docx
---

[[TOC]]

# Introduction

## Relevance and problem

**Libra** is a self-hosted e-book library that the author built before the
diploma. Its planned main feature is the **Librarian**, an AI assistant that a
reader asks about their own library: "Who is this man the author describes?",
"Which of my books has a similar idea?", "What else do I own in this style?".

Such assistants use *retrieval-augmented generation* (RAG): the system
retrieves the passages that relate to the question, and a large language model
(LLM) writes the answer from them [@lewis2020]. When retrieval misses, the LLM
answers from what it remembers from training, and the reader cannot tell. This
already happens: Calibre's AI features, added in 2025, give the model only a
book's metadata or a selected text [@calibrewhatsnew; @calibrellm].

**The problem: it is not known which retrieval technique finds the right
passages for the questions readers ask about books.** RAG tools use text
embeddings by default, not measured on books. Yet two people choose the same
word for the same thing less than 20% of the time [@furnas1987], and fiction
shows ideas without naming them. A new technique, LLM-written *semantic
descriptors* such as "moral choice under pressure" [@willison2026], targets
this gap, but has not been measured on books.

**Who has the problem:** Libra's readers, and the project, which must choose
its retrieval before building the Librarian on it. **Why now:** the
Librarian is Libra's next stage, embeddings run on an ordinary CPU, and
describing the 9,476 passages of 40 books costs about 4–7 USD at off-peak prices.

## Goal and objectives

**Goal:** to choose, by a controlled experiment, the retrieval technique for
the RAG pipeline of Libra's Librarian, comparing LLM-generated semantic
descriptors with keyword, embedding and hybrid retrieval.

**Objectives:**

1. Analyse what retrieval the Librarian needs, and review existing AI reading
   assistants and retrieval methods.
2. Specify the requirements for the retrieval module and for showing its
   results in the Librarian panel.
3. Build the retrieval module: chunking of book text, BM25, text-embedding and
   descriptor search, and hybrid ranking with Reciprocal Rank Fusion.
4. Compare six retrieval configurations on 40 public-domain books with
   Recall@5, Recall@10 and MRR@10, separately for fiction and non-fiction and,
   if time allows, for factual and interpretive questions, with paired
   statistical tests.
5. Connect the best configuration to the Librarian panel, which shows the
   passages it retrieves.

## Object and subject

**Object:** the Librarian feature of Libra — answering a reader's questions
about their own library with retrieval-augmented generation.

**Subject:** the retrieval step of that feature: finding the passages that
answer a question, with LLM-generated semantic descriptors.

## Methods

Document analysis (the EPUB 3.3 specification [@epub33], Standard Ebooks
files [@standardebooks], Libra's design documents), analysis of Libra's code,
benchmarking of analogs (Section 1.3), a literature review (Section 1.2), and
consultations with the supervisor. The experiment itself is specified in
Chapter 2 and runs after this analysis.

# Chapter 1. Analytical part

## 1.1 Current state

### The existing system

Libra (versions 0.1.0 and 0.2.0) is a self-hosted web application for a
household's e-book library, with EPUB upload, shelves, tags and notes, an
in-browser reader, Kindle delivery and accounts. **These functions are not
part of the diploma's new work.** They are the platform the retrieval module
plugs into, and they set its limits: one server, no GPU, one SQLite database,
one Docker image for `amd64` and `arm64`.

The Librarian already has its chat panel, but its replies are fixed text:
nothing in Libra reads the text of a book. The planned Librarian is an agent
with three tools [@libraarch], and each depends on the step the diploma builds
— given a question, find the right passages.

| Tool | What it does | What it needs from retrieval |
|---|---|---|
| `search_library` | Finds books and passages for a question | Passages from the whole library |
| `answer_about_book` | Answers a question about one book | Passages from that book |
| `recommend_similar` | Suggests books like the current one | Passages or books similar in idea or style |

### Who is involved

| Role | Part in the process today |
|---|---|
| Reader | Has a question about a book; finds the answer alone, or not at all |
| Kindle owner | A reader on a Kindle, where search covers only the open book |
| Household administrator | Runs the server; will have to index the books and pay for the LLM |
| Author as developer of the Librarian | Must choose the retrieval technique before building the Librarian on it |

### How a question is answered today

Without the Librarian, a reader guesses which book holds the answer, opens it
in a reader app that searches one book by keyword (Libra's reader cannot),
and guesses the author's words. If nothing is found, they try other words and
other books, then give up or ask a general chatbot, which answers from memory
(Figure 1). Builders of RAG tools, for their part, usually store text
embeddings in a vector database by default — rarely measured on their kind of
text, and almost never on fiction ([Section 1.2](#12-review-of-sources)).

[[FIGURE: as-is.png | AS-IS process: a reader looks for the answer to a question about a book (UML activity) | 9]]

### Where time and quality are lost

1. **The reader must know the author's words and the book.** Keyword search
   in one book at a time fails on questions about ideas [@furnas1987].
2. **AI tools answer from memory.** A general chatbot cannot see the reader's
   books, and Calibre's AI sees only metadata or the selected text, so their
   answers cannot be checked against the text.
3. **A Librarian built on an unmeasured retriever inherits its misses.** When
   the retriever misses, the LLM answers without the passage, and the reader
   cannot tell.

### TO-BE process (short)

The reader asks the Librarian in their own words. The retrieval module ranks
every passage of every book with the configuration that the experiment will
choose. **In the diploma**, the panel shows these passages, with book and
chapter, so retrieval can be checked on its own. **After the diploma**, an LLM
writes the answer from the same passages, and every agent tool uses the same
retrieval.

## 1.2 Review of sources

The review covers keyword retrieval, dense retrieval, LLM-based expansion,
and the evaluation of retrieval.

**Keyword retrieval.** BM25 ranks documents by how often the query words
appear in them, weighted by how rare each word is [@robertson2009]. It needs
no training, and on the BEIR benchmark it beats many neural models on
unfamiliar data [@thakur2021], but a passage that says the same thing in other
words gets nothing [@furnas1987]. *Conclusion:* BM25 is a baseline that every
new method must beat.

**Dense retrieval.** Dense retrievers encode the question and each passage as
vectors and rank by similarity; Karpukhin et al. showed that this beats BM25
on open-domain question answering [@karpukhin2020]. RAG puts an LLM on top of
such a retriever, so a passage the retriever misses cannot be used at all
[@lewis2020]. Small embedding models, such as the BGE family [@xiao2023], now
run on a CPU. *Conclusion:* embeddings are the second baseline, the model runs
locally on a CPU (NFR-01), and retrieval is measured on its own, before any
answer is generated.

**LLM-based expansion.** Doc2query generates likely questions for each
document before indexing [@nogueira2019]; HyDE asks an LLM for a hypothetical
answer and searches with its embedding [@gao2023]. Semantic descriptors combine
both ideas: an LLM describes each passage and each question with short
phrases, and search compares the phrases [@willison2026]. Matching a set of
query phrases against a set of passage phrases follows the late-interaction
idea of ColBERT [@khattab2020], and rankings are merged with Reciprocal Rank
Fusion (RRF), which needs no tuning [@cormack2009]. *Conclusion:* descriptors
are tested alone and merged with embeddings; because merging almost any two
rankings helps, the descriptor hybrid must also beat the usual BM25 +
embeddings hybrid (KPI-1).

**Where the sources stop.** Doc2query and HyDE were tested on web and
Wikipedia text, not books, and results on one kind of text do not carry over
to another [@thakur2021]. No source tests descriptors on fiction. *Conclusion:*
the experiment will use less famous books, keep the title out of the prompt
(US-2.2), and report results by genre and by question kind: *factual* ("who
is this man?") and *interpretive* ("which chapter has a similar idea?").

**Evaluation.** Recall@k and mean reciprocal rank (MRR) are the standard
measures when each question has one known correct passage [@thakur2021]. For
two systems on the same questions, Smucker et al. recommend paired
randomisation tests and bootstrap intervals [@smucker2007]. *Conclusion:* the
experiment will report Recall@5, Recall@10 and MRR@10 with paired bootstrap
intervals, randomisation tests and the Holm correction (Epic E5).

Chapter 2 follows the BABOK Guide for stakeholder analysis and traceability
[@babok] and writes user stories in Cohn's form [@cohn2004].

## 1.3 Analysis of analogs

No existing product is both a personal e-book library and an AI assistant over
the reader's own books, so the analogs come from two groups:

- **A. Personal e-book library managers:** **Calibre** [@calibre], the
  standard desktop manager, with optional AI features since 2025
  [@calibrewhatsnew]; **Calibre-Web** [@calibreweb], a self-hosted web
  interface over a Calibre library, named in the topic application; and
  **Kavita** [@kavita], a self-hosted reading server.
- **B. AI assistants over the user's own documents:** **AnythingLLM**
  [@anythingllm], open source and self-hosted; and **NotebookLM**
  [@notebooklm], a commercial Google service that answers only from uploaded
  documents, with citations.

Store-centred products, such as Google Play Books and Kindle features like
X-Ray [@kindlexray], were left out: they are built around books bought in the
store, not around a library of the reader's own files.

[[TABLE: Comparison of analogs]]

| Criterion | Calibre (A) | Calibre-Web (A) | Kavita (A) | AnythingLLM (B) | NotebookLM (B) | Libra |
|---|---|---|---|---|---|---|
| Keeps and manages the reader's own EPUB files | Yes | Yes | Yes | No | No | Yes |
| Accepts EPUB files as a source for questions | No: the AI gets only metadata or the selected text | — | — | Yes [@anythingllmtypes] | Yes | Yes |
| Answers questions about the content of books | Yes, from the LLM's memory of the book, or about selected text | No | No | Yes | Yes, only from the uploaded sources | Passages now; answers after the diploma |
| Works across the whole library | Keyword search; the AI discusses only selected books, by metadata | Yes, metadata search only | Yes, metadata, bookmarks and the reader's own highlights only [@kavitasearch] | Yes, one workspace | One notebook, limited number of sources | Yes |
| Retrieval by meaning, not only by keywords | No: the AI does no retrieval | No | No | Yes (embeddings) | Yes (method not published) | Yes (embeddings + descriptors) |
| Shows the source passages | Keyword hits; AI answers show none | No | No: only passages the reader highlighted | As citations | As citations | Yes, with book and chapter |
| Retrieval technique measured on books | No | No | No | No | Not published | Planned (the experiment) |
| Self-hosted; books and questions stay at home | Yes; local LLMs possible | Yes | Yes | Yes | No | Yes (LLM optional) |

**What is missing.** Group A manages the reader's books, but Calibre-Web and
Kavita cannot answer questions, and Calibre's AI never sees the text: it
answers from memory and shows no source. Group B answers, but it is not a
library — the books must be uploaded again into a separate tool, and
NotebookLM keeps them in Google's cloud. Neither group uses a retrieval
technique measured on books. No product offers **an assistant inside the
reader's own library whose retrieval was chosen by measurement on books**; the
diploma builds and measures that retrieval.

**What Libra takes from the analogs.** From NotebookLM: answers come only
from the reader's own sources, and each passage is shown as a citation that
opens its source (US-4.1, US-4.2). From AnythingLLM: one pool of all the books,
searched together on the reader's own server, with embeddings as the baseline
method. From Calibre: the LLM is optional, and search still works without it
(NFR-07). From Calibre-Web and Kavita: a self-hosted web library that the
household already uses, so the books are never uploaded again. Libra does not
take NotebookLM's cloud storage, AnythingLLM's separate copy of the documents,
or the answers from the model's memory that Calibre's AI gives.

## 1.4 Chapter conclusions

| ID | Problem | Epic | KPI |
|---|---|---|---|
| P1 | The Librarian's answers will depend on a retrieval technique that nobody has measured on books | E5 Retrieval experiment | KPI-1 |
| P2 | Interpretive questions do not share words with the text (the vocabulary problem), most of all in fiction | E2 Descriptors, E3 Retrieval | KPI-1 |
| P3 | Libra cannot read the text of its books; there is no retrieval layer for the Librarian to call | E1 Text indexing, E3 Retrieval | KPI-2 |
| P4 | An answer whose passages are not shown cannot be checked by the reader | E4 Librarian panel | KPI-4 |
| P5 | Retrieval must run on a home server without a GPU, at a low LLM cost | E1, E2 | KPI-2, KPI-3 |

**What the new solution must be able to do:** rank every passage of the
library for a question in the reader's own words, with the technique the
experiment shows to be best; return the passages through one call for the
Librarian's tools; and show them in the panel — on a CPU-only home server.

# Chapter 2. System requirements

## 2.1 Vision and goals

**Vision statement.** For readers who keep their own e-book library, the Libra
Librarian answers questions about their books from the books' own text. Unlike
Calibre's AI, which answers from the model's memory, or assistants with a
default retriever, it finds its passages with a technique measured on books.

**Business goals.**

- **G1.** Choose the Librarian's retrieval technique by a reproducible
  experiment on books, by genre and, if time allows, by question kind.
- **G2.** Give the future Librarian one retrieval call that all its tools can
  use.
- **G3.** Make retrieval visible to readers now, within Libra's limits: one
  server, no GPU, low cost.

[[TABLE: Key performance indicators]]

| KPI | Measure | Baseline | Target | How it is measured |
|---|---|---|---|---|
| KPI-1 | Recall@10 of the panel's method on the test questions | Recall@10 of BM25 + embeddings, measured on the same questions in the same run | Higher than the baseline: the 95% paired bootstrap interval of the difference lies above 0 | `rag evaluate` and `rag report` on the frozen protocol |
| KPI-2 | Retrieval response time, 95th percentile | None: Libra cannot read book text | ≤ 2 s on the 40-book library | Timer around `rag.search`, 100 questions |
| KPI-3 | LLM cost to index the 40-book library | 0 USD: BM25 + embeddings run locally and need no LLM | ≤ 10 USD in total, ≤ 0.25 USD per book | Token usage saved with every LLM response |
| KPI-4 | Share of test questions where one of the three passages the panel shows is the source passage (Success@3): the reader sees the answer without opening a book | Success@3 of BM25 alone, the keyword search a reader uses today, measured on the same questions in the same run | Higher than the baseline: the 95% paired bootstrap interval of the difference lies above 0 | `rag evaluate` with k = 3; shown live at the pre-defense demo on 10 test questions chosen before it |

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

The influence/interest matrix is in Appendix B. **System users (actors):**
Reader, Household administrator, Researcher, and — after the diploma — the
Librarian agent. External systems: the DeepSeek API, and the embedding model,
which runs inside the server.

**Persona 1 — Mark, 52, a reader.** He reads long novels over weeks, forgets
who a character is, and remembers ideas but not their book. He wants the
book's own text as proof, not a summary that may be made up.

**Persona 2 — Anna, 38, the household administrator.** She runs Libra on a
home server with 600 books, and will turn the search on only if it runs on her
CPU, costs a known one-time amount (about 0.1–0.2 USD a book), and keeps her
family's questions at home by default.

## 2.3 Project scope

**In scope (new in the diploma):**

- Chunking each EPUB into passages of 250–300 words, indexed by BM25, text
  vectors and LLM-written descriptors.
- Six search configurations (BM25, embeddings, descriptors, three RRF hybrids)
  behind one call, `search(question, method, k)`.
- The retrieval experiment on 40 public-domain books, with a report.
- The panel shows the top three passages of the best configuration, each
  opening the book at its chapter; search also works in the Docker image.

**Out of scope:**

- Libra's existing functions, except where the panel links to the reader.
- The rest of the Librarian, after the diploma: LLM-written answers, the
  tool-calling agent, and recommendations by style.
- Other chunk sizes and models, a local LLM, approximate vector indexes.

[[TABLE: Assumptions and constraints]]

| Type | Statement |
|---|---|
| Constraint (deadline) | The experiment's results are ready for its expert assessment, which must happen before the pre-defense; the panel works for the pre-defense on 6–9 Jan 2027 |
| Constraint (resources) | One developer; a CPU-only server; an LLM budget of about 10 USD |
| Constraint (platform) | The module lives inside Libra: one FastAPI server, one SQLite database, one Docker image |
| Assumption (data) | Standard Ebooks files are CC0 and stay available; the exact 42 files are kept on a GitHub release with their `sha256` |
| Assumption (API) | The DeepSeek API stays available at about the September 2026 price; every response is saved, so the evaluation never calls it again |

## 2.4 Solution concept

The retrieval module, the `rag` package of Libra's server, stores each book's
chunks in the same SQLite database as the books, each with a BM25 entry
(FTS5), a text vector from the local model `bge-base-en-v1.5`, and eight
descriptors written once by an external LLM. Each method ranks every chunk,
and RRF merges the rankings of a hybrid. One call, `search(question, method,
k)`, serves the panel now and the agent's tools later; the experiment runs the
same code, so its numbers describe the system in the demo.

[[FIGURE: context.png | Context diagram]]

[[TABLE: Alternatives considered for the search index]]

| Criterion | A. Separate vector database (Chroma) | B. Everything in Libra's SQLite (chosen) |
|---|---|---|
| Deleting a book | Two stores; a failed second delete leaves passages of a deleted book | One transaction removes the book and its chunks |
| BM25 | Needs a second library that rebuilds its index at every start | Built in (FTS5) |
| Search accuracy | Approximate index can miss true neighbours | Exact search: every chunk is scored |
| Dependencies | Extra service and dependency tree | None beyond the embedding library |
| Scale | Millions of vectors | About 1 million vectors (≈ 500 books) |

**Rationale.** B is simpler and safer for a household library, and exact
search removes approximate-index misses as a second cause of differences
between the methods. Its limit of about 500 books is recorded for after the
diploma.

## 2.5 Functional requirements

| ID | Epic | Goal | Priority |
|---|---|---|---|
| E1 | Book text indexing | G2, G3 | Must |
| E2 | Semantic descriptors | G1 | Must |
| E3 | Retrieval (configurations and the retrieval call) | G1, G2 | Must |
| E4 | Librarian panel shows passages | G3 | Must |
| E5 | Retrieval experiment | G1 | Must |

Every epic is Must, because each holds a part that the topic application
promises; priorities differ at the level of stories. The full backlog of 22
user stories (17 Must, 4 Should, 1 Could), with acceptance criteria in
Given/When/Then form and the order in which work is postponed, is in
Appendix A. The key stories:

**US-3.3 (Should).** As a reader, I want search to work when the LLM is not
available, so that I can still find passages.

- *Given* the LLM API does not answer within 10 seconds, *when* I ask a
  question, *then* the search uses BM25 + embeddings, and the panel says that
  a simpler search was used.

**US-3.4 (Must).** As the developer of the Librarian, I want one retrieval
call, so that every future tool of the agent uses the same, measured
retrieval.

- *Given* an indexed library, *when* `search(question, method, k)` is called
  with any of the six configurations, *then* it returns at most `k` passages,
  each with the book, the chapter, the text and the score, best first.

**US-4.1 (Must).** As a reader, I want to ask the Librarian a question in my
own words, so that I see the passages of my books that answer it.

- *Given* the library is indexed, *when* I send a question, *then* I see up to
  three passages, each with the book title, the chapter title and an excerpt,
  within 2 seconds (NFR-01).
- *Given* no passage matches, *when* the search ends, *then* the panel says
  so, and shows no invented text.

**US-4.2 (Must).** As a reader, I want to open a found passage in the book, so
that I can read it in context.

- *Given* a passage in the results, *when* I select it, *then* Libra's reader
  opens that book at that chapter.

The layouts below were made in the running application, with a mockup of the
panel that shows real passages from the test books.

[[FIGURES: mockup-passages.png | Layout for US-4.1: three passages for a question || mockup-fallback.png | Layout for US-3.3: the notice that a simpler search was used]]

[[FIGURE: mockup-reader.png | Layout for US-4.2: "Open in the reader" opens the book at the passage | 5.5]]

**Traceability.**

| Goal | KPI | Epic | Stories |
|---|---|---|---|
| G1 Choose retrieval by experiment | KPI-1 | E2, E3, E5 | US-2.1 – US-2.4, US-3.1 – US-3.2, US-5.1 – US-5.5 |
| G2 One retrieval call for the Librarian | KPI-2 | E1, E3 | US-1.1 – US-1.4, US-3.3, US-3.4 |
| G3 Retrieval visible in the panel | KPI-2, KPI-3, KPI-4 | E4 | US-4.1 – US-4.5 |

## 2.6 Use case scenarios

The use case diagram and the system sequence diagram for UC-1 are in
Appendix B.

### UC-1. Find a passage by question

**Actor:** reader. **Precondition:** the reader is logged in, and the books are
indexed with descriptors. **Postcondition:** the question and the passages are
saved in the reader's conversation.

**Main flow:**

1. The reader types a question in the Librarian panel and sends it.
2. The system saves the question in the reader's conversation.
3. The system asks the LLM for five descriptors of the question.
4. The system ranks all chunks with the configured method and takes the top
   three.
5. The system streams the reply: three passages, each with the book, the
   chapter and an excerpt.
6. The reader selects a passage, and the reader opens the book at that
   chapter.

**Alternative flows:** **3a.** The LLM does not answer within 10 seconds: the
system ranks with BM25 + embeddings, which need no LLM, says so, and continues
at step 5. **4a.** Nothing matches: the system says that no passage was found
and suggests other words.

### UC-2. Index the library

**Actor:** the household administrator (or the researcher, for the test
corpus). **Precondition:** the books are in Libra, and the LLM API key is set.
**Postcondition:** every chunk has a BM25 entry, a text vector and 8
descriptors.

**Main flow:** (1) the administrator runs `rag index`; (2) the system stores
each book's chunks, BM25 entries and vectors in one transaction; (3) the
administrator runs `rag describe`; (4) the system gets 8 descriptors per chunk
from the LLM and saves each response; (5) it reports the failures and the
cost. **Alternative flows:** **4a.** A wrong key or an empty balance stops the
run at once. **4b.** After a crash, the next run skips described chunks, so
nothing is paid twice.

## 2.7 Non-functional requirements

[[TABLE: Non-functional requirements]]

| ID | Category | Requirement and measure | Linked to |
|---|---|---|---|
| NFR-01 | Performance | Search answers in ≤ 2 s at the 95th percentile on the 40-book library (9,476 chunks, about 76,000 descriptor vectors), on a 4-core CPU | KPI-2, US-4.1 |
| NFR-02 | Performance | Text indexing of the 40 books takes ≤ 30 min on the same CPU | US-1.2 |
| NFR-03 | Capacity | All vectors of the 40-book library fit in ≤ 1 GB of memory | KPI-2 |
| NFR-04 | Cost | Descriptors for the 40-book library cost ≤ 10 USD | KPI-3, US-2.1 |
| NFR-05 | Security | The LLM API key never appears in a log line or an error message (checked by a test) | US-2.3 |
| NFR-06 | Privacy | Each reader sees only their own conversation (another's returns 404) | US-4.1 |
| NFR-07 | Availability | Search works without the LLM API, with BM25 + embeddings | US-3.3 |
| NFR-08 | Portability | The Docker image runs search on `linux/amd64` and `linux/arm64` | US-4.4, US-4.5 |
| NFR-09 | Usability | The panel meets WCAG 2.1 level AA and works at a width of 360 px | US-4.1, US-4.2 |
| NFR-10 | Reproducibility | Two evaluations of the same saved inputs give byte-identical result files | KPI-1, US-5.4 |

## 2.8 Legal and ethical requirements

**Personal data.** The module adds one kind of personal data: the reader's
questions. A household running Libra for its own members is a purely personal
activity, outside the GDPR (Art. 2(2)(c)) [@gdpr], but the module follows its
principles: each conversation is private. Questions sent to the DeepSeek API
for descriptors leave the EU and may contain personal data, so the
administrator can turn the LLM off (search then uses BM25 + embeddings), and
the panel says that questions go to an external service.

**Consent of participants.** No interviews or surveys with other people were
conducted; the test questions were written or reviewed by the author.

**Licences and standards.** The test books are CC0 [@standardebooks]; the
embedding model `bge-base-en-v1.5` and Libra are MIT; `fastembed` is
Apache 2.0; the DeepSeek API is used under the provider's terms. The panel
follows WCAG 2.1 level AA [@wcag21] (NFR-09), and the quality requirements
follow the ISO/IEC 25010 model [@iso25010].

## 2.9 Risks

[[TABLE: Project risks]]

| ID | Risk | Probability | Impact | Mitigation | Dependency |
|---|---|---|---|---|---|
| R1 | Descriptors do not beat the baselines | M | M | A negative result is valid; every hypothesis is answered with an interval; the panel uses the best method found | Experiment results |
| R2 | The schedule slips: the experiment, the panel and the thesis text all fall between the BA defense and the pre-defense | H | H | A fixed order of work to postpone first (Appendix A): Could and Should stories, then optional analyses; nothing promised in the topic application is dropped | University deadlines |
| R3 | The LLM provider changes the model, the price or the JSON output | M | M | A pilot checks both before the full run; every response is saved; the protocol records the model version | DeepSeek API |
| R4 | The LLM knows famous books and describes the answer from memory | M | H | Less famous books; no title or author in the prompt; named in the report | Book choice |
| R5 | One correct chunk per question under-counts correct results | H | M | A 50-question sample where every relevant chunk is judged by hand | Test questions |
| R6 | The embedding model does not run, or runs too slowly, on `arm64` | L | M | `arm64` test build on every dependency change | Docker, ONNX Runtime |

## 2.10 Chapter conclusions

The specification fixes three goals and four KPIs, nine stakeholders, a
scope limited to the retrieval layer, the experiment and the panel, five epics
and 22 user stories, two use cases, ten measurable non-functional
requirements, the legal basis for the new personal data, and six risks.

The result is verified against the KPIs of Section 2.1: **KPI-1** by the
frozen experiment protocol, **KPI-2** by timing 100 searches, **KPI-3** by
the token usage saved with every LLM response, and **KPI-4** by the same run
and live at the pre-defense demo. The acceptance criteria of the
Must stories are checked by automated tests and by the pre-defense demo.

# List of references

[[REFERENCES]]

# Appendix A. Backlog

[[TABLE: Full backlog]]

| ID | Epic | User story | Acceptance criteria | MoSCoW |
|---|---|---|---|---|
| US-1.1 | E1 | As the researcher, I want each book split into chunks of whole paragraphs, so that each chunk is one passage that a question can be answered from | Given an EPUB, when it is chunked, then only body chapters are used, no chunk crosses a chapter, no chunks overlap, and none is over 450 tokens. | Must |
| US-1.2 | E1 | As an administrator, I want one command to index the library, so that its text can be searched | Given books without chunks, when I run `rag index`, then each book's chunks, BM25 entries and vectors are stored in one transaction, and indexed books are skipped. | Must |
| US-1.3 | E1 | As an administrator, I want a deleted book's chunks removed with it, so that search never shows a book that is gone | Given an indexed book, when it is deleted, then its chunks, vectors and descriptors are removed, also when a new book later reuses its id. | Should |
| US-1.4 | E1 | As an administrator, I want new uploads indexed for search, so that every book can be found | Given a new upload, when indexing finishes, then its passages are found by BM25 and by embeddings. | Could |
| US-2.1 | E2 | As an administrator, I want descriptors written for every chunk, so that search by descriptors works | Given chunks without descriptors, when I run `rag describe`, then each gets exactly 8 descriptors, and failures are counted after 3 retries. | Must |
| US-2.2 | E2 | As the researcher, I want descriptors written from the passage text only, so that the LLM describes the passage, not a book it remembers | Given a chunk, when descriptors are requested, then the prompt holds no title and no author, and exactly 8 descriptors of 2–6 words are saved. | Must |
| US-2.3 | E2 | As an administrator, I want every LLM response saved, so that a crash or a rerun never pays twice | Given a crash during `rag describe`, when I run it again, then finished chunks are skipped and no saved response is lost; the API key appears in no log. | Must |
| US-2.4 | E2 | As the researcher, I want the descriptor prompt tuned on books outside the test set, so that the prompt is not fitted to the test | Given the 2 pilot books, when the prompt is tuned, then no test book is used, and the final prompt is recorded in the protocol. | Must |
| US-3.1 | E3 | As the researcher, I want passages ranked by BM25, by embeddings and by descriptors, so that each method can be compared on the same questions | Given a question, when it is searched with each single method, then every chunk is scored and the top k are returned. | Must |
| US-3.2 | E3 | As the researcher, I want rankings merged with RRF, so that the hybrids can be compared with the single methods | Given two or three rankings, when they are merged, then each chunk scores Σ 1/(60 + rank) over each list's top 100. | Must |
| US-3.3 | E3 | As a reader, I want search to work when the LLM is unavailable, so that I can still find passages | See Section 2.5. | Should |
| US-3.4 | E3 | As the developer of the Librarian, I want one retrieval call with the method and the number of passages as arguments, so that every future agent tool uses the same, measured retrieval | See Section 2.5. | Must |
| US-4.1 | E4 | As a reader, I want to ask the Librarian a question in my own words, so that I see the passages of my books that answer it | See Section 2.5. | Must |
| US-4.2 | E4 | As a reader, I want to open a found passage in the book, so that I can read it in context | See Section 2.5. | Must |
| US-4.3 | E4 | As an administrator, I want to choose the search method in the settings, so that the panel uses the experiment's winner | Given a method set in the settings, when a reader asks, then that method ranks the chunks. | Should |
| US-4.4 | E4 | As an administrator, I want search to work in the Docker image, so that I can run it on my server | Given the image on `amd64`, when a reader asks a question, then passages are returned. | Must |
| US-4.5 | E4 | As an administrator with an ARM server, such as a Raspberry Pi, I want search to work in the `arm64` image, so that I can run it on that server | Given the image on `arm64`, when a reader asks a question, then passages are returned. | Should |
| US-5.1 | E5 | As the researcher, I want to write hand questions before any result exists, so that the questions do not favour one method | Given the frozen chunker, when I run `rag hand-question`, then I see a random chunk and record a question and its kind. | Must |
| US-5.2 | E5 | As the researcher, I want LLM-drafted questions reviewed one by one, so that only valid questions are used | Given a draft, when I review it, then I keep, edit or drop it, and a drop records its reason. | Must |
| US-5.3 | E5 | As the researcher, I want the protocol frozen and tagged before the full run, so that the analysis cannot follow the results | Given the protocol, when it is committed, then it is tagged `experiment-protocol-v1` before any final result exists. | Must |
| US-5.4 | E5 | As the researcher, I want one command to evaluate every configuration, so that the results can be repeated | Given the frozen protocol and the saved descriptors, when I run `rag evaluate`, then the rank of the source chunk is written for every question and configuration, and a second run gives byte-identical files. | Must |
| US-5.5 | E5 | As the researcher, I want intervals and tests for each hypothesis, so that the conclusions are sound | Given a run, when I run `rag report`, then each hypothesis has a 95% bootstrap interval and a Holm-corrected p-value, per genre. | Must |

**Order of postponement (risk R2).** If the schedule slips, work moves after
the pre-defense in this order: the Could story (US-1.4); the Should stories
(US-1.3, US-3.3, US-4.3, US-4.5); then three optional analyses — the check of
descriptor accuracy, the review of failed questions, and the analysis by
question kind. Nothing promised in the topic application moves.

# Appendix B. Diagrams

[[FIGURE: as-is.png | AS-IS process: a reader looks for the answer to a question about a book (UML activity), full size]]
[[FIGURE: stakeholder-matrix.png | Influence/interest matrix, full size]]
[[FIGURE: context.png | Context diagram, full size]]
[[FIGURE: use-cases.png | Use case diagram, full size]]
[[FIGURE: sequence-uc1.png | System sequence diagram for UC-1, full size]]

# Statements

**Use of AI.** The following AI tools were used in this work:

| Tool | What it was used for |
|---|---|
| Claude (Anthropic) | Drafting the structure and a first version of the text from the project's own documentation; drafting the diagram sources; checking the source code of the analog Calibre; building the mockup of the Librarian panel used for the layouts in Section 2.5 |
| DeepSeek | Part of the method under study: in the experiment it writes the semantic descriptors and drafts test questions (Section 2.4). It was not used to write this document. |
| Perplexity | Finding sources and checking facts |
| NotebookLM | Tried as one of the analogs compared in Section 1.3. It was not used to write this document. |

The author reviewed and corrected all AI output before using it, and is
responsible for the content of this document.

**Project type.** Individual project; no table of contributions is needed.

**Organisation's consent.** The project is not done for an organisation and
uses no organisation's data. The test books are public-domain texts from
Standard Ebooks.
