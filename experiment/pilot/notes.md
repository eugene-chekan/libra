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

The pilot itself cost about 2 cents.

**The full run, estimated from these numbers:** 9,476 chunks × 475 prompt
tokens is about 4.5M input tokens, and 9,476 × 70 is about 0.66M output tokens.
At the plan's off-peak prices ($0.66 per million input tokens, $1.98 per million
output tokens), that is about $3.0 + $1.3 = **$4.3 if nothing is cached**, and
about $8.6 at peak prices. Both are under the $10 limit (KPI-3, NFR-04).
Caching the prompt would lower it a little. The prices themselves are not
checked again yet.

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

## Open choices before the full run

1. **The prompt's example.** Keep "moral choice under pressure" (1 copy in 40
   answers), or replace it with a format that cannot be copied, such as
   `{"descriptors": ["...", "...", …]}`. A change makes the prompt v1, and v1
   would need a short pilot of its own.
2. **Names in questions.** Keep the questions as they are (a real reader uses
   names), or ask the question prompt to ignore names. The same choice applies
   to the drafted questions.
3. **Log the cached tokens.** The log saves `prompt_tokens` but not
   `prompt_cache_hit_tokens`, so the pilot cannot show whether DeepSeek cached
   the prompt. It is a small change to `rag/deepseek.py` before the full run.
4. **The model name in the protocol.** Record `deepseek-v4-pro` with the
   `system_fingerprint`, not `DeepSeek-V4-Pro-0813`.
5. **Parallel requests.** The full-run command needs up to 8 requests in
   parallel, or the run takes about 5 hours.
6. **Prices.** Check DeepSeek's prices again on the day of the full run.
