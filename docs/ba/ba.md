---
title: A Passage Retrieval System for an E-book Library Using LLM-Generated Semantic Descriptors
subtitle: Business Analysis Block — Introduction, Chapter 1 and Chapter 2
author: [TODO: Surname Name, as in the university records]
supervisor: [TODO: supervisor's title and full name]
programme: [TODO: study programme]
type: Individual project
place: Vilnius, 2026
---

[[TOC]]

# Introduction

## Relevance and problem

Many readers keep a personal library of e-books in the EPUB format. They buy
DRM-free books, download public-domain classics, and collect files over years.
A household often shares one such library, and many of its members read on a
Kindle.

These readers have a common problem: **they remember an idea from a book, but
not the words.** A reader recalls "the part where the captain doubts his own
orders", or "the argument that habits come before reasons". To find that
passage again, the reader must guess the exact words the author used. Library
tools search by title and author, and at best by keywords inside the text.
Keyword search fails when the question and the text use different words. This
is the *vocabulary problem*: people describe the same thing with different
words far more often than system designers expect [@furnas1987]. The problem is
worst in fiction, where the text shows a scene and never names the idea behind
it.

The problem matters now for two reasons. First, text embedding models now run
on an ordinary CPU, so a self-hosted library on a home server or a Raspberry Pi
can search by meaning without a GPU. Second, large language models (LLMs) have
become cheap enough to describe every passage of a library. A recent technique
asks an LLM to write short, free-form *semantic descriptors* for each passage,
such as "moral choice under pressure", and searches over those descriptors
[@willison2026]. For the 40 books used in this project (about 2.5 million words
in 9,476 passages), describing every passage costs an estimated 8–12 USD. It is
not yet known whether such descriptors find the right passage more often than
the methods that exist today. No self-hosted library manager offers this kind
of search ([Section 1.3](#13-analysis-of-analogs)).

**One number that shows the scale:** [TODO: one number for slide 1. Options:
the share of survey respondents who failed to find a remembered passage, or the
share of your 40 hand questions that BM25 does not find in its top 10 — known
after the full run.]

## Goal and objectives

**Goal:** to design, build and evaluate a self-hosted e-book library system
whose search finds the passage that answers a reader's question, using
LLM-generated semantic descriptors.

**Objectives:** [TODO: confirm these with the supervisor — the requirements
say "3–5 objectives agreed with the supervisor".]

1. Analyse how readers manage personal e-book libraries and find passages today,
   and review existing tools and retrieval methods.
2. Specify the requirements for the system: the library functions, Kindle
   delivery, and passage search.
3. Build the system, libra, and a retrieval experiment on 40 public-domain
   books that compares six search configurations: BM25, text embeddings,
   descriptors, and three hybrids.
4. Measure the configurations with recall@5, recall@10 and MRR@10, for fiction
   and non-fiction separately, with statistical tests.
5. Integrate the best configuration into the library's librarian panel, which
   shows the passages it finds.

## Object and subject

**Object:** the process of managing a personal e-book library and finding
information in it — adding books, organising and reading them, sending them to
a Kindle, and finding a passage again.

**Subject:** the automatable side of that process: passage retrieval over the
full text of the library, together with catalogue management and Kindle
delivery in a self-hosted web system.

## Methods

The requirements were gathered and checked with these methods:

- **Document analysis:** the EPUB 3.3 specification [@epub33], Amazon's Send to
  Kindle documentation [@sendtokindle], the documentation of Standard Ebooks
  [@standardebooks], and the university's diploma requirements.
- **Benchmarking of analogs:** four existing tools were installed or used and
  compared on the same criteria ([Section 1.3](#13-analysis-of-analogs)).
- **Literature review:** retrieval methods and their evaluation
  ([Section 1.2](#12-review-of-sources)).
- **Observation of the author's own use:** the author has run libra as a
  household library since [TODO: month], and kept a list of the tasks that
  took time.
- **Consultations with the supervisor**, which set the scope of the
  experiment on 8 and 13 September 2026.
- [TODO: **Survey** of [N] readers who keep e-book libraries (Google Form,
  [date]). Ten questions: library size, devices, tools, and how they find a
  remembered passage. Recommended: it gives evidence that the problem is real,
  which is the first question the committee asks. If you do not run it, delete
  this item.]

# Chapter 1. Analytical part

## 1.1 Current state

### How the task is solved today

A typical household library has a few hundred EPUB files. One member, the
*household administrator*, keeps them on a computer or a home server. Other
members read on phones, in the browser, or on a Kindle. Today the household
uses a mix of tools:

- **Calibre** [@calibre] on one desktop computer holds the catalogue.
  Other members cannot reach it unless the administrator also runs a server.
- **Files are sent to a Kindle by hand.** The reader downloads the EPUB, opens
  an e-mail client, writes to the device's `@kindle.com` address, attaches the
  file and sends it. The sender address must be on the Amazon approved list,
  or Amazon drops the message without any error [@sendtokindle].
- **Finding a passage again** is done with the search box of one reader app,
  inside one book at a time, by keyword. If the reader does not remember which
  book holds the passage, they search book by book, or they search the web.

### Who is involved

| Role | What they do today |
|---|---|
| Reader | Reads books, keeps notes and highlights, wants to find passages again |
| Household administrator | Adds books, fixes metadata, keeps the files and backups, sets up delivery |
| Kindle owner | A reader who reads on a Kindle and needs books delivered to it |
| Amazon Send to Kindle | External service that accepts e-mailed documents |

### Where time and data are lost

1. **Finding a passage by meaning.** The reader has to guess the author's
   words. When the guess fails, there is no second strategy except reading.
   [TODO: one measured example: e.g. "finding 5 remembered passages in Calibre
   took on average N minutes, and 2 of 5 were not found".]
2. **Searching one book at a time.** Reader apps search inside the open book
   only. A question about "the library" has no tool.
3. **Manual Kindle delivery.** About six manual steps for each book, and
   silent failure when the sender is not approved.
4. **Scattered personal data.** Notes, highlights and reading progress live
   in each device's app and are not connected to the shared catalogue.
5. **One computer holds the catalogue.** Other household members depend on
   the administrator to get a book.

### AS-IS process

[[FIGURE: as-is.png | AS-IS process: finding a remembered passage (UML activity)]]

The AS-IS process in the figure starts when the reader remembers an idea. The
reader guesses keywords, opens a likely book and searches it. If nothing is
found, the reader tries other words, then other books, and finally gives up or
searches the web. The loop has no end condition except success or giving up,
and the time it takes grows with the size of the library.

### TO-BE process (short)

In the TO-BE process the reader types the question in their own words into the
librarian panel. The system searches every book at once, by keywords and by
meaning, and shows the three best passages, each with its book and chapter. One
click opens the passage in the in-browser reader. Kindle delivery becomes one
button on the book page. The catalogue, notes and progress live on one
self-hosted server that every household member reaches from a browser.

## 1.2 Review of sources

The review covers four areas: classic keyword retrieval, dense retrieval,
LLM-based expansion of documents and queries, and the evaluation of retrieval.
It ends with the requirements that follow from the sources.

**Keyword retrieval.** BM25 ranks documents by how often the query words appear
in them, weighted by how rare each word is and normalised by document length
[@robertson2009]. It is fast, needs no training, and remains a strong baseline:
on the BEIR benchmark, BM25 beats many neural models on data unlike their
training data [@thakur2021]. Its weakness is the vocabulary problem: it scores
zero for a passage that expresses the same idea in other words [@furnas1987].
*Conclusion for this project:* BM25 must be one of the baselines, and any new
method must beat it, not only a weak baseline.

**Dense retrieval.** Dense retrievers encode the question and each passage as
vectors and rank passages by vector similarity. Karpukhin et al. showed that
such a retriever beats BM25 on open-domain question answering
[@karpukhin2020]. Retrieval-augmented generation builds on this: an LLM writes
an answer from retrieved passages [@lewis2020]. Small general-purpose embedding
models, such as the BGE family [@xiao2023], now run on a CPU.
*Conclusion:* the text-embedding method (`dense`) is the second baseline, and
the model must run locally on a CPU (NFR-03, NFR-08).

**LLM-based expansion.** Two lines of work add generated text to bridge the
vocabulary gap. Doc2query generates likely questions for each document and
appends them before indexing [@nogueira2019]. HyDE asks an LLM to write a
hypothetical answer to the question and searches with its embedding
[@gao2023]. Semantic descriptors combine both ideas: an LLM describes each
passage and each question with short phrases, and search compares the phrases
[@willison2026]. Matching a set of query phrases against a set of passage
phrases is the late-interaction idea of ColBERT, which scores each query token
by its best match in the document [@khattab2020]. Merging rankings from
different methods is commonly done with reciprocal rank fusion (RRF), which
needs no tuning [@cormack2009].
*Conclusion:* descriptors are tested both alone and merged with `dense` by RRF.
Because "any two rankings merged" often beat each one alone, the descriptor
hybrid must also beat the usual `bm25+dense` hybrid (KPI-1). The LLM must not
see the book title, so it describes the passage, not a book it may remember
from training (US-6.5).

**Evaluation.** Recall@k and mean reciprocal rank (MRR) are the standard
measures for known-item search, where each question has one correct passage
[@thakur2021]. For comparing two systems on the same questions, Smucker et al.
recommend paired randomisation tests and bootstrap intervals over the t-test
or sign test [@smucker2007].
*Conclusion:* the experiment reports recall@5, recall@10 and MRR@10 with paired
bootstrap intervals, randomisation tests and the Holm correction (Epic E7).

**Requirements practice and quality.** The requirements in Chapter 2 follow the
BABOK Guide for stakeholder analysis and requirements traceability [@babok],
user stories in the form proposed by Cohn [@cohn2004], and the product quality
model of ISO/IEC 25010 for the non-functional requirements [@iso25010].
Personal data and accessibility follow the GDPR [@gdpr] and WCAG 2.1 [@wcag21].

[TODO: the section needs analysis, not retelling. Add one or two sentences
where the sources disagree or have limits: e.g. BEIR shows dense models
generalise badly, which is a reason to test on books unlike the model's
training data; doc2query was tested on MS MARCO, not on fiction.]

## 1.3 Analysis of analogs

Five solutions were compared: three open-source self-hosted tools and two
commercial services. [TODO: install or open each one, try the same three tasks
(add a book, send it to Kindle, find a remembered passage), take screenshots,
and correct any cell below that does not match what you saw. The cells marked
"?" need checking.]

- **Calibre** [@calibre] — the standard desktop e-book manager, open source.
- **Calibre-Web** [@calibreweb] — an open-source web interface over a Calibre
  database, for self-hosting. The topic application names it as the main
  analog.
- **Kavita** [@kavita] — an open-source self-hosted reading server for books,
  comics and manga.
- **Amazon Kindle with Send to Kindle** [@sendtokindle] — the commercial
  service most Kindle owners use.
- **Google Play Books** [@playbooks] — a commercial service that accepts
  uploaded EPUB files.

[[TABLE: Comparison of analogs]]

| Criterion | Calibre | Calibre-Web | Kavita | Kindle + Send to Kindle | Google Play Books | libra |
|---|---|---|---|---|---|---|
| Self-hosted; files stay at home | Yes (desktop) | Yes | Yes | No | No | Yes |
| Several users, each with own progress and shelves | No | Yes | Yes | One account | One account | Yes |
| Send to Kindle from the library | Yes (e-mail) | Yes (e-mail) | ? | Yes | No | Yes |
| In-browser reader, works on a phone | No | Yes | Yes | Yes (app) | Yes | Yes |
| Keyword search inside book text | Yes (full-text search) | ? | ? | One book at a time | One book at a time | Yes (BM25) |
| Search by meaning across the library, with passages | No | No | No | No | No | Yes |
| Open source, free | Yes | Yes | Yes | No | No | Yes (MIT) |

[[FIGURE: analog-screens.png | Screenshots of the analogs during the test tasks]]

**What is missing.** All five tools manage and deliver books well, and two of
them search the full text by keywords. None of them answers a question asked in
the reader's own words with the passages that answer it, across the whole
library. The commercial services do not keep files at home, and the desktop
tool is not shared. The gap that libra fills is therefore: **a shared,
self-hosted library with Kindle delivery and with search by meaning that shows
the source passages.**

## 1.4 Chapter conclusions

The analysis found these problems. Each one is linked to a future epic and KPI
from Chapter 2.

| ID | Problem | Epic | KPI |
|---|---|---|---|
| P1 | A passage cannot be found when the reader does not remember the author's words | E6 Passage search | KPI-1, KPI-2 |
| P2 | Search works inside one book at a time | E6 Passage search | KPI-2 |
| P3 | It is not known which search method finds passages best, especially in fiction | E7 Retrieval experiment | KPI-1 |
| P4 | Kindle delivery takes about six manual steps and fails silently | E4 Kindle delivery | KPI-3 |
| P5 | The catalogue sits on one computer; notes and progress are scattered | E1 Catalogue, E2 Organisation, E5 Accounts | KPI-4 |

**What the new solution must be able to do:** keep a household's EPUB library
on one self-hosted server; give each member their own progress, shelves, tags
and notes; send a book to a Kindle in one action; and answer a question in the
reader's own words with the passages that answer it, using the search method
that the experiment shows to be best.

# Chapter 2. System requirements

## 2.1 Vision and goals

**Vision statement.** For readers who keep their own e-book libraries, libra is
a self-hosted library that the whole household shares. Unlike Calibre-Web and
other library servers, it finds the passage a reader is thinking of, even when
the reader does not remember the author's words, and it shows that passage
with its book and chapter.

**Business goals.**

- **G1.** Let readers find a remembered passage by meaning, across the whole
  library.
- **G2.** Show, with a reproducible experiment, which search method finds
  passages best, and use that method in the product.
- **G3.** Give a household one shared, self-hosted library with private
  per-reader data and one-step Kindle delivery.

[[TABLE: Key performance indicators]]

| KPI | Measure | Baseline | Target | How it is measured |
|---|---|---|---|---|
| KPI-1 | Recall@10 of the search used in the panel, on the test questions | Recall@10 of `bm25+dense` in the same run [TODO: value after the run] | Higher than the baseline; the 95% interval of the gain is above 0 [TODO: or name a number with the supervisor, e.g. +5 points] | `rag evaluate` and `rag report` on the frozen protocol |
| KPI-2 | Time for a reader to find a remembered passage | [TODO: measured with Calibre's search, e.g. 5 tasks, average N min] | Under 1 minute on average, and at least 4 of 5 found | The same 5 tasks, timed, in libra |
| KPI-3 | Steps to send a book to a Kindle | 6 manual steps (download, open mail, address, attach, send, check) | 1 step (one button) | Count of user actions |
| KPI-4 | Search response time, 95th percentile | — (new function) | ≤ 2 s on the 40-book library | Timer around `rag.search`, 100 questions |

## 2.2 Stakeholders and users

[[TABLE: Stakeholders]]

| Stakeholder | Interest | Influence |
|---|---|---|
| Reader (household member) | Find books and passages; private notes and progress | M |
| Household administrator | A reliable library that is easy to install, back up and upgrade | H |
| Kindle owner | Books arrive on the device without manual steps | M |
| Diploma supervisor | A sound experiment and a working demo; agrees the scope | H |
| Diploma committee and experts | Requirements, results and demo meet the criteria | H |
| Author (developer and researcher) | Finish on time with valid results | H |
| DeepSeek (LLM provider) | API usage under its terms | L |
| Amazon (Send to Kindle) | E-mail delivery under its rules | L |
| Standard Ebooks (book source) | Correct use of its CC0 books | L |

[[FIGURE: stakeholder-matrix.png | Influence/interest matrix]]

**System users (actors in the scenarios):** Reader, Household administrator,
and Researcher (the author running the experiment). External systems: the
Amazon Send to Kindle service, an SMTP mail server, and the DeepSeek API.

**Persona 1 — Anna, the household administrator.** Anna is 38 and works in IT.
She keeps about 600 EPUB files that she has collected for ten years, and runs
a small home server. Her partner and her teenage son read on a Kindle and on
their phones. Anna wants one library that everyone can reach from a browser,
that she can back up and upgrade with one command, and that does not send the
family's reading data to a company.

**Persona 2 — Mark, the reader who remembers ideas.** Mark is 52 and reads
history and philosophy, and some classic novels. He often remembers an
argument or a scene, but never the exact sentence. Last month he spent half an
hour looking for a passage about habits and character, and did not find it.
Mark wants to type "the part about habits coming before reasons" and see the
passage.

## 2.3 Project scope

**In scope:**

- EPUB upload with metadata and cover extraction; a shared catalogue with
  search by title, author and tag.
- Accounts created by an administrator; per-reader progress, ratings, shelves,
  personal tags and private notes.
- In-browser reader that works on a phone; file download.
- Send to Kindle by e-mail.
- Passage search: chunking the book text, BM25, text embeddings, LLM-written
  descriptors and RRF hybrids.
- The retrieval experiment on 40 public-domain books, with reviewed test
  questions, metrics and statistics.
- The librarian panel showing the passages that the best method finds.
- Docker image for `amd64` and `arm64`.

**Out of scope:**

- Written answers from the librarian, and the tool-calling librarian agent
  (planned after the diploma).
- Format conversion (MOBI, PDF to EPUB) — deferred after the experiment.
- Formats other than EPUB, and DRM-protected files.
- Self-registration, password reset and public multi-tenant hosting.
- A user study (removed from the diploma on 13 September 2026).
- Desktop and mobile app builds.

[[TABLE: Assumptions and constraints]]

| Type | Statement |
|---|---|
| Constraint (deadline) | The experiment must be finished for the practice defense on 9–14 Nov 2026; the panel must work for the pre-defense on 6–9 Jan 2027 |
| Constraint (resources) | One developer; a CPU-only server; LLM budget about 10–20 USD |
| Assumption (data) | Standard Ebooks files are CC0 and stay available; the exact 42 files are kept on a GitHub release with their `sha256` |
| Assumption (API) | The DeepSeek API stays available with JSON output at the September 2026 price; every response is saved, so the evaluation never needs the API again |
| Constraint (external rules) | Amazon accepts personal documents only from approved sender addresses and up to about 50 MB |

## 2.4 Solution concept

libra is a web application with one server. The server is a Python FastAPI
application with a SQLite database and a folder of EPUB files. The same server
delivers the TypeScript/React client, so every device on the home network opens
the app at one address. The search module splits each book into passages
(chunks) of about 250–300 words, indexes them for BM25 with SQLite FTS5, and
stores a text vector for each chunk from a local embedding model. An external
LLM writes eight descriptors for each chunk, once; their vectors are stored in
the same database. A question is searched by the configured method, and the
librarian panel shows the top three passages. Kindle delivery sends the EPUB
through the household's SMTP server to Amazon.

[[FIGURE: context.png | Context diagram]]

[[TABLE: Alternatives considered]]

| Criterion | A. Extend Calibre-Web | B. Build libra (chosen) |
|---|---|---|
| Time to a working library | Short: the library exists | Longer: built in Phase 1 and Phase 4 (done) |
| Fit of data model for chunks, vectors and descriptors | Poor: Calibre's database schema is owned by Calibre | Full control; one SQLite database with migrations |
| Testability for the experiment | The search would be a plugin outside the main tests | The experiment uses the product's own code, so the numbers describe the demo |
| Multi-user privacy rules | Fixed by Calibre-Web | Designed in: private notes, per-user shelves and tags |
| Risk | Upstream changes break the plugin | All work is the author's |

**Rationale.** Option B was chosen because the experiment must measure the
same code that the committee sees in the demo, and because chunks, vectors and
descriptors need their own tables and migrations. The library part of B is
already built (versions 0.1.0 and 0.2.0), so the extra cost is already paid.
For storage, SQLite with exact in-memory vector search was chosen over a
separate vector database (Chroma): one database deletes a book and its
passages in one transaction, BM25 is built in, and exact search removes
approximate-index errors from the comparison.

## 2.5 Functional requirements

### Epics

| ID | Epic | Goal | Priority |
|---|---|---|---|
| E1 | Library catalogue | G3 | Must |
| E2 | Organisation and personal data | G3 | Should |
| E3 | Reading | G3 | Should |
| E4 | Kindle delivery | G3 | Must |
| E5 | Accounts and administration | G3 | Must |
| E6 | Passage search (librarian panel) | G1 | Must |
| E7 | Retrieval experiment | G2 | Must |

The full backlog of 30 user stories, with acceptance criteria in
Given/When/Then form, is in Appendix A. The three key stories of the main
epic, E6, are below.

### Key user stories

**US-6.1 (Must).** As a reader, I want to ask a question in my own words, so
that I can find a passage without remembering the author's words.

- *Given* the library is indexed, *when* I type a question in the librarian
  panel and send it, *then* I see up to three passages, each with the book
  title, the chapter title and an excerpt.
- *Given* a search is running, *when* I wait, *then* the panel shows that it
  is searching, and the passages appear within 2 seconds (NFR-01).
- *Given* no passage scores above zero, *when* the search ends, *then* the
  panel says that nothing was found, and does not invent a passage.

**US-6.2 (Must).** As a reader, I want to open a found passage in the book, so
that I can read it in context.

- *Given* a passage in the results, *when* I select it, *then* the in-browser
  reader opens that book at that chapter.

**US-6.3 (Should).** As a reader, I want search to work when the LLM service
is not available, so that I can still find passages.

- *Given* the DeepSeek API does not answer within 10 seconds, *when* I ask a
  question, *then* the system searches with `bm25+dense`, and the panel says
  that a simpler search was used.

[TODO: mockups for 3–4 key stories. Take screenshots from a scratch instance
(`scripts/run.ps1 -Scratch`): (1) the librarian panel with three passages —
draw it over the current stub screen if part 2 is not built; (2) the book page
with "Send to Kindle"; (3) the reader opened at a passage; (4) the library
grid with the search box. Put them here as figures.]

### Traceability

| Goal | KPI | Epic | Stories |
|---|---|---|---|
| G1 Find passages by meaning | KPI-1, KPI-2, KPI-4 | E6 | US-6.1 – US-6.5 |
| G2 Show which method works best | KPI-1 | E7 | US-7.1 – US-7.5 |
| G3 One shared household library | KPI-3 | E1–E5 | US-1.1 – US-5.4 |

## 2.6 Use case scenarios

[[FIGURE: use-cases.png | Use case diagram]]

### UC-1. Find a passage by question

| Field | Content |
|---|---|
| Actor | Reader |
| Goal | See the passages that answer a question |
| Precondition | The reader is logged in. The library's books are indexed, with descriptors. |
| Postcondition | The question and the found passages are saved in the reader's conversation. |

**Main flow:**

1. The reader opens the librarian panel.
2. The reader types a question and sends it.
3. The system saves the question in the reader's conversation.
4. The system asks the LLM for five descriptors of the question.
5. The system ranks all chunks by the configured method (for example
   `dense+descriptors`) and takes the top three.
6. The system streams the reply: three passages, each with the book, the
   chapter and an excerpt.
7. The reader selects a passage, and the system opens the book at that chapter.

**Alternative flows:**

- **4a. The LLM does not answer.** After 10 seconds the system ranks with
  `bm25+dense`, which needs no LLM, and says so in the reply. The flow
  continues at step 6.
- **5a. Nothing matches.** The system replies that no passage was found and
  suggests other words. The use case ends.

### UC-2. Send a book to a Kindle

| Field | Content |
|---|---|
| Actor | Kindle owner |
| Goal | The book arrives on the Kindle |
| Precondition | SMTP is configured by the administrator. The reader has set their `@kindle.com` address and approved the sender address at Amazon. |
| Postcondition | The mail server has accepted the message. |

**Main flow:**

1. The reader opens a book's page and selects "Send to Kindle".
2. The system checks the encoded size against Amazon's limit.
3. The system builds an e-mail with the EPUB attached and hands it to the
   SMTP server.
4. The system shows the time of the attempt.

**Alternative flows:**

- **2a. The book is too large.** The system shows the limit and stops.
- **3a. The mail server refuses the message.** The system shows the server's
  error; nothing is retried.
- **1a. No Kindle address is set.** The system asks the reader to set one in
  their profile, and shows the sender address to approve at Amazon.

[[FIGURE: sequence-uc1.png | System sequence diagram for UC-1]]

## 2.7 Non-functional requirements

[[TABLE: Non-functional requirements]]

| ID | Category | Requirement and measure | Linked to |
|---|---|---|---|
| NFR-01 | Performance | Passage search answers in ≤ 2 s at the 95th percentile, for the 40-book library (9,476 chunks, about 76,000 descriptor vectors), on a 4-core CPU without GPU | KPI-4, US-6.1 |
| NFR-02 | Performance | Uploading a 10 MB EPUB, including metadata extraction, takes ≤ 5 s | US-1.1 |
| NFR-03 | Capacity | All search vectors of the 40-book library fit in ≤ 1 GB of memory | KPI-4 |
| NFR-04 | Security | Passwords are hashed with Argon2id; sessions are server-side, revocable, in an httpOnly cookie; there is no open registration | US-5.1 |
| NFR-05 | Security / privacy | Another user's note returns 404, never its content; 100% of the privacy tests pass in CI | US-2.4 |
| NFR-06 | Security | Book content runs in a sandboxed frame with scripts disabled; book descriptions are rebuilt from an allow-list of tags | US-3.1 |
| NFR-07 | Security | The LLM API key never appears in a log line or error message (checked by a test) | US-7.3 |
| NFR-08 | Availability | Search keeps working without the LLM API, using `bm25+dense` (UC-1, flow 4a) | US-6.3 |
| NFR-09 | Availability / maintainability | An upgrade applies database migrations on start, with no manual step; `GET /health` reports version and build | US-5.4 |
| NFR-10 | Portability | One Docker image runs on `linux/amd64` and `linux/arm64` | US-5.4 |
| NFR-11 | Usability | The client meets WCAG 2.1 level AA on the main path (browse, search, read, ask); zero errors from the accessibility lint in CI | US-6.1, US-3.1 |
| NFR-12 | Usability | Every screen works at a width of 360 px (phone) | US-3.1, US-6.1 |
| NFR-13 | Reproducibility | Two evaluations of the same saved inputs give byte-identical result files | KPI-1, US-7.1 |

## 2.8 Legal and ethical requirements

**Personal data.** libra processes these personal data: user names and password
hashes; each user's `@kindle.com` address; reading progress, ratings, shelves,
tags and notes; and the questions asked in the librarian panel. When a
household runs libra for its own members, the processing is a purely personal
or household activity, which the GDPR does not cover (Art. 2(2)(c)) [@gdpr].
The system is still designed to the GDPR's principles: data minimisation (no
e-mail address is needed to log in), privacy by default (shelves are private
until published, notes are never shared), and erasure (deleting an account
removes all of that user's private data).

**Data sent to third parties.** In the experiment, only the text of
public-domain books is sent to the DeepSeek API; no personal data is sent. In
the product, a reader's question is sent to the API to get its descriptors.
The question may contain personal data, and DeepSeek processes data outside
the EU. Therefore the administrator must be able to switch the LLM off
(search then uses `bm25+dense`), and the panel must state that questions are
sent to an external service. Kindle delivery sends the book and the reader's
Kindle address to the configured mail server and to Amazon.

**Consent of participants.** [TODO: if you run the survey or interviews: they
are anonymous, participants agree on the first screen of the form, no names or
e-mail addresses are collected, and answers are used only for this thesis. If
you run none, write: "No interviews or surveys with other people were
conducted; the test questions were written by the author."]

**Licences.**

| Component | Licence |
|---|---|
| Test books (Standard Ebooks) | CC0 (public domain dedication) [@standardebooks] |
| libra source code | MIT |
| Embedding model `BAAI/bge-base-en-v1.5` | MIT |
| `fastembed` library | Apache 2.0 [TODO: check] |
| epub.js (in-browser reader) | BSD-2-Clause [TODO: check] |
| DeepSeek API | DeepSeek's terms of service; output is used for research |

**Standards.** The web client follows WCAG 2.1 level AA [@wcag21] (NFR-11), and
the quality requirements are grouped by the ISO/IEC 25010 product quality
model [@iso25010].

## 2.9 Risks

[[TABLE: Project risks]]

| ID | Risk | Probability | Impact | Mitigation | Dependency |
|---|---|---|---|---|---|
| R1 | Descriptors do not beat the baselines | M | M | A negative result is valid; the report gives intervals for every hypothesis; the panel then uses the best method found | Experiment results |
| R2 | The schedule slips: the experiment has no spare week, and the BA block falls in the same week as the full run | H | H | A fixed order of work that moves to the thesis period; nothing promised in the topic application moves | University deadlines |
| R3 | DeepSeek changes the model, the price or the JSON output | M | M | A pilot checks both before the full run; every response is saved; the protocol records the model version | DeepSeek API |
| R4 | The LLM knows famous books and describes the answer from memory | M | H | Less famous books; no title or author in the prompt; named in the report | Book choice |
| R5 | One correct chunk per question under-counts correct results | H | M | A 50-question checked sample where every relevant chunk is judged by hand | Test questions |
| R6 | The embedding model does not install or is too slow on `arm64` | L | M | `arm64` dry-run build on every dependency change; model choice fixed early | Docker, ONNX Runtime |

**Top 3 risks for the defense:** R2, R4 and R1.

## 2.10 Chapter conclusions

The requirements specification fixes the following: three business goals and
four KPIs; nine stakeholders and three user roles; the scope, with the
librarian agent, written answers and format conversion out of scope; seven
epics and 30 user stories with MoSCoW priorities and acceptance criteria; two
use case scenarios; thirteen measurable non-functional requirements; the legal
basis for personal data and the licences; and six risks with mitigations.

The result will be verified against the KPIs from Section 2.1:

- **KPI-1** — by the frozen experiment protocol: recall@10 of the panel's
  method against `bm25+dense`, with a 95% paired bootstrap interval.
- **KPI-2** — by timing the same five passage-finding tasks in the old tools
  and in libra.
- **KPI-3** — by counting the user's actions for Kindle delivery.
- **KPI-4** — by timing 100 searches on the 40-book library.

Acceptance criteria of every Must story are checked by automated tests
(pytest, Vitest, Playwright) and by the demo at the pre-defense.

# List of references

[[REFERENCES]]

# Appendix A. Backlog

[[TABLE: Full backlog]]

| ID | Epic | User story | Acceptance criteria | MoSCoW |
|---|---|---|---|---|
| US-1.1 | E1 | As a reader, I want to upload an EPUB, so that it joins the shared library | Given a valid EPUB, when I upload it, then a book appears with title, author and cover read from the file. Given a non-EPUB file, then I see a 415 error and nothing is stored. | Must |
| US-1.2 | E1 | As a reader, I want to search the catalogue by title, author and tag, so that I can find a book quickly | Given books in the library, when I type part of a title or `#tag`, then only matching books are listed. | Must |
| US-1.3 | E1 | As a reader, I want to see a book's cover and description, so that I can choose what to read | Given a book with a cover, when I open its page, then the cover and description are shown; HTML in the description cannot run scripts. | Should |
| US-1.4 | E1 | As an administrator, I want to correct a book's metadata, so that the catalogue is accurate | Given I am an admin, when I edit the title, then everyone sees the new title. Given I am not an admin, then the edit is refused (403). | Should |
| US-1.5 | E1 | As an administrator, I want to delete a book, so that wrong uploads leave the library | Given I am an admin, when I delete a book, then its file, its chunks and everyone's state for it are removed. | Must |
| US-2.1 | E2 | As a reader, I want to put books on my own shelves, so that I can organise my reading | Given a shelf of mine, when I add a book, then it is on that shelf only for me. | Should |
| US-2.2 | E2 | As a reader, I want to publish a shelf, so that my family can see my list | Given a public shelf, when another user lists shelves, then they see it but cannot change it. | Could |
| US-2.3 | E2 | As a reader, I want personal tags, so that I can label books for myself | Given a personal tag, when another user views the book, then they do not see my tag. | Should |
| US-2.4 | E2 | As a reader, I want private notes on a book, so that I can keep my thoughts | Given my note, when another user, even an admin, requests it, then the answer is 404. | Must |
| US-2.5 | E2 | As a reader, I want to rate a book and see my progress, so that I remember where I am | Given I read in the browser, when I scroll, then my progress is saved for me only. | Should |
| US-3.1 | E3 | As a reader, I want to read a book in the browser, also on a phone, so that I need no other app | Given a book, when I open the reader on a 360 px screen, then the text is readable and the book's scripts do not run. | Must |
| US-3.2 | E3 | As a reader, I want to download the EPUB, so that I can read it in any app | Given a book, when I select Download, then I get the EPUB named after its title and author. | Must |
| US-4.1 | E4 | As a Kindle owner, I want to send a book to my Kindle with one action, so that I do not e-mail files by hand | Given my Kindle address is set and SMTP is configured, when I select "Send to Kindle", then the EPUB is e-mailed and I see that the mail server accepted it. Given the encoded book is over Amazon's limit, then I see the limit and no e-mail is sent. | Must |
| US-4.2 | E4 | As a Kindle owner, I want to see which sender address to approve, so that Amazon does not drop my books | Given SMTP is configured, when I open my profile, then the sender address is shown. | Must |
| US-4.3 | E4 | As an administrator, I want to configure SMTP once for the server, so that all readers can send books | Given SMTP settings are missing, then the Send to Kindle button is not offered. | Must |
| US-5.1 | E5 | As a reader, I want to log in with a password, so that my data is mine | Given correct credentials, when I log in, then I get a session; given wrong ones, then I see an error and the attempt is logged without the password. | Must |
| US-5.2 | E5 | As an administrator, I want to create and delete accounts, so that only my household uses the library | Given I delete an account, then its books stay and its private data is removed. | Must |
| US-5.3 | E5 | As an administrator, I want to create the first account from the server's shell, so that no stranger can register | Given a fresh install, when I run `create-admin`, then an admin account exists; there is no registration page. | Must |
| US-5.4 | E5 | As an administrator, I want to install and upgrade with one Docker command, so that maintenance is simple | Given a new version, when I pull and restart, then migrations run and `/health` shows the new version. | Should |
| US-6.1 | E6 | As a reader, I want to ask a question in my own words, so that I can find a passage without its exact words | See Section 2.5. | Must |
| US-6.2 | E6 | As a reader, I want to open a found passage in the book, so that I can read it in context | See Section 2.5. | Must |
| US-6.3 | E6 | As a reader, I want search to work when the LLM is unavailable, so that I can still find passages | See Section 2.5. | Should |
| US-6.4 | E6 | As an administrator, I want new uploads to be indexed for search, so that every book can be searched | Given a new upload, when indexing finishes, then its passages can be found by BM25 and dense search. | Could |
| US-6.5 | E6 | As the researcher, I want descriptors written from the passage text only, so that the LLM describes the passage, not a book it remembers | Given a chunk, when descriptors are requested, then the prompt contains no title or author, and exactly 8 descriptors of 2–6 words are saved. | Must |
| US-7.1 | E7 | As the researcher, I want one command to evaluate every method, so that the results can be repeated | Given the frozen protocol and saved descriptors, when I run `rag evaluate`, then a run folder with the rank of the source chunk per question and method is written, and a second run gives byte-identical files. | Must |
| US-7.2 | E7 | As the researcher, I want to write hand questions before seeing any results, so that the questions do not favour one method | Given the chunker is frozen, when I run `rag hand-question`, then I see a random chunk and record a question and its kind. | Must |
| US-7.3 | E7 | As the researcher, I want every LLM response saved, so that the evaluation never calls the API again | Given a crash during `describe`, when I run it again, then finished chunks are skipped and no response is lost. | Must |
| US-7.4 | E7 | As the researcher, I want drafted questions reviewed one by one, so that only valid questions are used | Given a draft, when I review it, then I keep, edit or drop it, and a drop records a reason. | Must |
| US-7.5 | E7 | As the researcher, I want intervals and tests for each hypothesis, so that the conclusions are sound | Given a run, when I run `rag report`, then each hypothesis has a 95% bootstrap interval and a Holm-corrected p-value, per genre. | Must |
| US-8.1 | — | As a reader, I want to convert MOBI and PDF to EPUB, so that I can add any book | Deferred after the diploma. | Won't |

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
`deepseek-v4-pro` is part of the method under study (descriptors and draft
questions), as described in Section 2.4." The requirements give a grade of 1–4
for AI-generated text that is not declared.]

**Project type.** Individual project; no table of contributions is needed.

**Organisation's consent.** The project is not done for an organisation and
uses no organisation's data. The test books are public-domain texts from
Standard Ebooks.
