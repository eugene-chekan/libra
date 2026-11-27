# Checks

Protocol section 11, checks 1, 2 and 4. Checks 3, 5 and 6 need a person's
judgement and are not here.

## 1. Hand set vs drafted set

Each set's methods, from the best recall@10 to the worst. A tie keeps the
protocol's order of methods.

| place | hand | hand recall@10 | drafted | drafted recall@10 |
|---|---|---|---|---|
| 1 | bm25 | 0.975 | all | 0.877 |
| 2 | all | 0.975 | bm25+dense | 0.853 |
| 3 | bm25+dense | 0.925 | bm25 | 0.829 |
| 4 | dense+descriptors | 0.825 | dense | 0.763 |
| 5 | dense | 0.600 | dense+descriptors | 0.707 |
| 6 | descriptors | 0.425 | descriptors | 0.413 |

Both sets order the methods the same way: no.

## 2. Word overlap

The share of a question's distinct words that are also in its source chunk.
Words are counted as in the 4-word check, in lower case. A curly apostrophe counts
as a straight one. Common words such as "the" count too. One value per question
is in overlap.csv.

| set | genre | questions | mean | median |
|---|---|---|---|---|
| all | all | 415 | 0.6 | 0.6 |
| all | fiction | 208 | 0.634 | 0.634 |
| all | non-fiction | 207 | 0.566 | 0.583 |
| hand | all | 40 | 0.661 | 0.667 |
| hand | fiction | 20 | 0.711 | 0.691 |
| hand | non-fiction | 20 | 0.611 | 0.629 |
| drafted | all | 375 | 0.594 | 0.6 |
| drafted | fiction | 188 | 0.626 | 0.615 |
| drafted | non-fiction | 187 | 0.561 | 0.571 |

## 4. Descriptor failures

A chunk or a question fails when its answer gives no valid descriptors.
"first check" counts the answers that failed the 2-6 word check when they arrived;
"failed" counts those that fail the 1-8 word check of deviation 1, which the run
used. A failed chunk is never found by descriptors; a failed question gets no
descriptor ranking.

| what | genre | total | first check | failed |
|---|---|---|---|---|
| chunks | all | 9476 | 278 | 7 |
| chunks | fiction | 4988 | 103 | 2 |
| chunks | non-fiction | 4488 | 175 | 5 |
| questions | all | 415 | 0 | 0 |
| questions | fiction | 208 | 0 | 0 |
| questions | non-fiction | 207 | 0 | 0 |
