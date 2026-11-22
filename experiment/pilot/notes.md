# Prompt pilot

Prompt v0 ran first. Its findings led to prompt v1, which ran on the same
chunks; see "Prompt pilot, prompt v1" below. The full run uses v1.

# Prompt pilot, prompt v0

Run on 2026-11-20 at 19:49 UTC (off-peak), on the 2 pilot books only:
*Essays* by Malatesta (non-fiction) and *Mike* by Wodehouse (fiction). No test
book was sent to DeepSeek.

- Command: `rag pilot-describe … --sample 20 --questions ../experiment/pilot/questions.txt`
- Log: `descriptors-v0.jsonl`, 45 lines: 20 chunks of each book and the 5
  questions in `questions.txt`.
- Code: `diploma/experiment` at c931090.

## What the pilot had to confirm

| Check | Result |
|---|---|
| JSON mode on `deepseek-v4-pro` | Works. 45 of 45 answers were valid on the first request. 0 retries, 0 failures. |
| Exactly 8 descriptors per chunk, 5 per question | Yes, in every answer. |
| Each descriptor 2–6 words | Yes. Chunks: 65 of 2 words, 125 of 3, 112 of 4, 17 of 5, 1 of 6. |
| Repeated descriptors in one answer | None. |
| The model name the server reports | `deepseek-v4-pro`, the same in all 45 answers. The plan expected `DeepSeek-V4-Pro-0813`; the API does not return that name. |
| `system_fingerprint` | `d400d062347a13495558bb956f2a0a0c`, the same in all 45 answers. |

## Tokens, time and cost

| | Prompt tokens (min / mean / max) | Output tokens (min / mean / max) | Seconds (mean / max) |
|---|---|---|---|
| Chunk (40) | 303 / 475 / 535 | 57 / 70 / 80 | 1.89 / 2.74 |
| Question (5) | 135 / 137 / 139 | 34 / 41 / 50 | 1.44 / 1.79 |

**DeepSeek's own usage report agrees with the log exactly.** The report for
2026-11-20 (downloaded by the author from the DeepSeek platform, not kept in
the repository) shows:

| | DeepSeek's report | Sum of the log |
|---|---|---|
| Requests | 45 | 45 |
| Input tokens, cache miss | 19,695 | 19,695 (`prompt_tokens`) |
| Input tokens, cache hit | none | — |
| Output tokens | 3,006 | 3,006 |
| Price per input token | $0.00000066 | — |
| Price per output token | $0.00000198 | — |
| Cost | **$0.01895** | 19,695 × $0.66/M + 3,006 × $1.98/M = $0.01895 |

So the pilot cost under 2 cents. The prices billed are the plan's off-peak
prices ($0.66 and $1.98 per million tokens), and **nothing was cached**: every
input token was billed as a cache miss.

**The full run, estimated from these numbers:** 9,476 chunks × 475 prompt
tokens is about 4.5M input tokens, and 9,476 × 70 is about 0.66M output tokens.
At the billed off-peak prices that is about $3.0 + $1.3 = **$4.3**, and about
$8.6 at peak prices. Both are under the $10 limit (KPI-3, NFR-04). The pilot
shows no caching, so $4.3 is the estimate to plan with, not a worst case.

**Time:** the pilot asks one request at a time. At 1.89 s a chunk, 9,476 chunks
would take about 5 hours one at a time, or about 40 minutes with 8 requests in
parallel, as the plan allows.

## What the descriptors look like

- **No names of people or places** in the chunk descriptors. Names of events
  stay, such as "postmen's strike", because they are in the text.
- **Non-fiction descriptors are specific to the passage**: for example
  "universal suffrage deception", "formation of social instinct".
- **Fiction descriptors are more general**, and some repeat across chunks:
  "schoolboy mischief" appears twice, and many *Mike* chunks have a cricket
  descriptor. This may make fiction chunks harder to tell apart.
- **The prompt's example was copied once.** Chunk 63 of *Essays* has
  "moral choice under pressure" as its first descriptor, and that is the
  example inside the prompt. 1 of 40 answers.
- **A name in a question brings in the model's knowledge of the book.** The
  question "Why did Malatesta believe that even an elected government becomes
  a privileged class?" got "anarchist political theory" and "state as
  oppressor". The question does not say "anarchist"; the model knows who
  Malatesta is. The hand questions contain names too.

## An informal check (not a result)

For each of the 5 questions, the 40 pilot chunks were ranked twice:

- by the question's descriptors against each chunk's descriptors (MaxSim: for
  each question descriptor, the best cosine against the chunk's 8, then the
  mean), and
- by dense search of the question against the chunk text.

| Question | Its chunk | Descriptor rank | Dense rank |
|---|---|---|---|
| What methods did Malatesta say governments use to check the revolutionary movement? | *Essays* 93 | 1 | 1 |
| Why did Malatesta believe that even an elected government becomes a privileged class? | *Essays* 30 | 15 | 1 |
| Why did Mr. Appleby feel he could not simply ignore Wyatt breaking out at night? | *Mike* 162 | 1 | 1 |
| How was Jellicoe hurt while crossing the field with Mike? | *Mike* 296 | 1 | 1 |
| Why did Mike think Wrykyn would agree to play Sedleigh? | *Mike* 393 | 1 | 1 |

The miss is the Malatesta question above: its descriptors became general
("anarchist political theory"), and they match many chunks of the same book.
Five questions over 40 chunks say only that the pipeline works end to end.
They say nothing about which method is better.

## Choices after v0

The author decided on 2026-11-22:

1. **The prompt's example.** Replaced. The answer form now holds only
   placeholders, `{"descriptors": ["...", …]}`, so there is no example to
   copy. This makes the prompt v1.
2. **Names in questions.** The questions stay as they are: a real reader uses
   names, and BM25 and dense search still see them. The question prompt now
   says to describe only what the question asks, and to use nothing the model
   knows about a person, place or book the question names. The chunk prompt
   already said the same about the passage.
3. **Log the cached tokens.** Done in v1: each entry saves `cache_hit_tokens`.

Still open before the full run:

4. **The model name in the protocol.** Record `deepseek-v4-pro` with the
   `system_fingerprint`, not `DeepSeek-V4-Pro-0813`.
5. **Parallel requests.** The full-run command needs up to 8 requests in
   parallel, or the run takes about 5 hours.
6. **Prices.** Check them again on the day of the full run, and compare the
   run's log with DeepSeek's usage report afterwards, as for v0.

# Prompt pilot, prompt v1

Run on 2026-11-22, 14:15–14:17 UTC (a Sunday, so off-peak), on the **same 40
chunks** and the same 5 questions as v0. The seeded shuffle picks the same
chunks. Log: `descriptors-v1.jsonl`, 45 lines.

## v0 and v1 side by side

| | v0 | v1 |
|---|---|---|
| Answers ok | 45 of 45 | 45 of 45 |
| Answers that needed a second request | 0 | 1 (*Mike* chunk 57) |
| Model, `system_fingerprint` | `deepseek-v4-pro`, `d400d062…` | the same |
| The example copied | 1 of 40 chunks | 0 (no example to copy) |
| A placeholder `...` returned as a descriptor | — | 0 |
| Chunk prompt tokens, mean | 475 | 496 |
| Chunk output tokens, mean | 70 | 76 |
| Chunk descriptors of 5–6 words | 18 of 320 | 59 of 320 |
| Question prompt tokens, mean | 137 | 162 |

- **v1 descriptors are a little longer.** More of them have 5 or 6 words.
- **The one retry.** The log keeps only the last answer, so the first answer's
  problem is not saved. Its final descriptors are long ("claiming act as
  justice not prank" has 6 words), so the first answer most likely had a
  descriptor of 7 words or more.
- **The names rule worked on the pilot question.** The Malatesta question got
  "elected government privilege; power concentration; state as oppressor;
  political class formation; authority and hierarchy". "anarchist political
  theory" is gone.

## Cached tokens

v1 logs `cache_hit_tokens` for each request:

- 4 of the 5 questions: 128 cached tokens each, from the shared question prompt.
- 39 of the 40 chunks: 0 cached tokens. The chunk prompt was not cached
  between different chunks in this run.
- *Mike* chunk 57: 384 cached tokens, because its retry sent the same request
  again.

In total, 896 of 20,650 input tokens were cached. Even if the whole chunk
prompt (about 128 tokens) were cached for every chunk, the full run would save
only about $0.77. So plan with no caching.

## The informal check again (not a result)

The same 5 questions and the same 40 chunks as for v0:

| Question | Its chunk | v0 descriptor rank | v1 descriptor rank | Dense rank |
|---|---|---|---|---|
| What methods did Malatesta say governments use to check the revolutionary movement? | *Essays* 93 | 1 | 1 | 1 |
| Why did Malatesta believe that even an elected government becomes a privileged class? | *Essays* 30 | 15 | **1** | 1 |
| Why did Mr. Appleby feel he could not simply ignore Wyatt breaking out at night? | *Mike* 162 | 1 | 1 | 1 |
| How was Jellicoe hurt while crossing the field with Mike? | *Mike* 296 | 1 | 1 | 1 |
| Why did Mike think Wrykyn would agree to play Sedleigh? | *Mike* 393 | 1 | 2 | 1 |

The Malatesta question moved from rank 15 to rank 1, and one *Mike* question
moved from 1 to 2. As before, 5 questions say only that the pipeline works.
They do not show that v1 is better than v0, and they do not compare methods.

## Cost of the full run with v1

9,476 chunks × 496 input tokens is about 4.7M input tokens, and 9,476 × 76 is
about 0.72M output tokens. At the off-peak prices billed for v0 ($0.66 and
$1.98 per million), that is about $3.1 + $1.4 = **$4.5**, and about $9.1 at
peak prices. Both are under the $10 limit, but the peak figure is close to it,
so the full run must happen off-peak.
