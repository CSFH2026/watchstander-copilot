# Is this RAG? Retrieval, its limits, and what comes next

Written 2026-11-05 for the Friday 9:00 AM finals and for team questions.
Every number here was measured on 2026-11-05 on an Apple M1 Pro against commit `ba1aae0`, unless the line says otherwise.
The laptop was shared with other build jobs during the runs (load average 28 to 66), so the latency numbers are a worst case.
On an idle laptop the same queries take 7 to 12 ms ([DEMO.md](DEMO.md)).

## Short answer

We use the retrieval half of RAG and not the generation half.
RAG means "retrieval-augmented generation": a search finds passages, and then a language model writes an answer from them.
The copilot does the search, and then it returns the procedure's own steps, word for word, with the citation.
No language model writes, rewrites, reorders, or chooses a step.
So the right name is "hybrid retrieval with a policy engine", not RAG.

## 1. What the code does

### The answer path

One question goes through these steps in `api/retrieval/search.py`, called from `POST /api/query` in `api/main.py`.

1. **Scope gate.** `Retriever.scope_check` refuses the question before any search when it names no equipment or casualty word that the corpus uses.
   It refuses by name when the question names equipment in the `uncovered` list of `corpus/ddg/scope.yaml`, for example "No authorized procedure is held for ship service diesel generator."
   The domain words come from the procedures' own titles, symptoms, causes, and effects, so a new card widens the scope with no code change.
2. **Keyword score.** BM25 (`rank_bm25`) over each step's search text: procedure title, symptoms, causes, and step text, after shorthand expansion (LO to lube oil, SSGTG to ship service gas turbine generator).
3. **Meaning score.** A local `BAAI/bge-small-en-v1.5` embedding (384 numbers, ONNX on the CPU through `fastembed`), compared by cosine against every step.
4. **Fusion.** Reciprocal rank fusion merges the two ranked lists: each step scores the sum of 1 / (60 + rank) from each list.
5. **Cosine floors.** No answer when the best cosine is under `min_cosine` (0.64 for ddg on the laptop), or under 0.62 with no keyword hit at all.
6. **Group and rank.** Each procedure scores its best step.
   The top procedure is the answer; up to four others are listed only if they pass the same floors on their own steps.
   When the second scores at least 94% of the first, the answer is marked `ambiguous` and the Sailor confirms which one.
7. **Return.** `api/main.py` returns the chosen procedure's steps from the policy engine, in order, with each step's lock state, its source string, the matched words, the best cosine, and a signed audit entry.

The returned steps are the rows of the procedure file, copied out.
Nothing in this path makes text that was not already in `corpus/ddg/*.md`.

### The model slots and their state

`config/local.yaml` and `config/cloudflare.yaml` each name four model slots.

| Slot | Laptop (`local.yaml`) | Cloud test build (`cloudflare.yaml`) | Code exists? |
| --- | --- | --- | --- |
| `embed` | `BAAI/bge-small-en-v1.5`, local | `@cf/baai/bge-small-en-v1.5`, Workers AI | Yes, `api/retrieval/embed.py` and `cloud/src/embed.ts` |
| `transcribe` | off | off | No |
| `rewrite` | off | off | No |
| `rerank` | off | off | No |

`api/config.py` lists `transcribe`, `rewrite`, and `rerank` in `UNBUILT_SLOTS`, and `load()` refuses to start if any of them is set to anything but `off`.
So no configuration can turn on a rewrite or a rerank today, by mistake or on purpose.
The cloud backend calls Workers AI only in `cloud/src/embed.ts`, for the embedding.
The only model in either backend is the embedding model, and an embedding model cannot write text: it turns text into 384 numbers.

`api/retrieval/README.md` still describes an optional `qwen2.5:3b` rewrite step and a cross-encoder rerank as plans (issues #7 and stretch).
Neither one is built.

### The dataset

`corpus/ddg/dataset.yaml` names the set: 103 DDG-51 engineering casualty procedures, 779 steps, built from public, unclassified training text (COMSCINST 3541.6A, NAVEDTRA 14111, 14113, 14114, Engineman 1 & C, Damage Controlman 3 & 2).
It is `kind: doctrine`, and it overrides the floor to `min_cosine: 0.64` on the laptop and 0.59 on the cloud model.
Each procedure file's status line says which steps are taken from a source, adapted, or synthetic.

## 2. Why retrieval only

### The project's own evidence

[DEMO.md](DEMO.md) records a zero-context local model on this laptop, `llama3.2:1b`, asked "Number two SSDG has low lube oil pressure. Give the casualty control steps in order".
Run 1 took 11.7 s and said to use fire suppression and drain fuel, and it never started the standby generator.
Run 2 took 3.4 s and refused, and called it a medical emergency.
The same question gave two different wrong answers.
That is the use case's main fear: a watchstander cannot trust a tool that invents steps or answers differently each time.
Also, a DDG has no diesel generators; the copilot refuses that question by name, and the model did not notice.

[Architecture.md](Architecture.md) states the design rule: each model hop adds latency and one more chance to invent or distort a step.

### What the use case asks for

- **Offline.** Use case 21 requires zero cloud.
  Everything runs on a laptop CPU with Wi-Fi off.
  The embedding model is 64 MB.
- **Authorized doctrine only.** The answer must be the authorized procedure, not a paraphrase of it.
- **Step order.** The policy engine in `api/policy/` enforces each step's `requires:` list.
  It blocks step 05 until 04 is done, and says why.
  This works only because the steps are exact rows with IDs.
  Generated prose has no step IDs to lock.
- **Audit.** Every query and every action is signed into a hash-chained log.
  The log can show exactly which card and which step the watch saw, because the copilot showed card text, not model text.

### Honest trade-offs

| | Retrieval only (what we built) | Full RAG with a local model |
| --- | --- | --- |
| Made-up steps | None possible: every step is a corpus row | Possible on every answer; needs a check after the model |
| Same question, same answer | Yes, deterministic | No, unless the model runs at temperature 0, and even then a corpus change shifts wording |
| Speed on a laptop CPU | 7 to 12 ms idle, 22 ms p50 under heavy load | 3 to 12 s measured for a 1B model; DEMO.md expects a 3B model to miss a 2 s cutoff often (not measured) |
| Offline | Yes, 64 MB model | Yes, but 1 to 2 GB of model, and slow |
| Audit | Logs card and step IDs | Must log the model output, the prompt, and the model version, and still cannot prove the answer matches doctrine |
| Step-order locks | Work, because steps have IDs | Need the model output mapped back to step IDs first |
| Free-form answers ("why does this happen?") | No | Yes |
| Merges two procedures for two casualties at once | No: it shows the best card and lists the others | Yes, and that is the risk: it can blend steps from two cards |
| Poor phrasing | Can miss: depends on words and on one small embedding model | More forgiving of phrasing |
| Explains a step in plain words | No | Yes |

The cost of our design is real: the watch gets the card, not a conversation.
For casualty control, we think that is the right trade.
The card is what the watch is trained on, and the card is what the CHENG signs.

## 3. Limits today, measured

### The ddg eval

`scripts/eval_ddg.py` runs the questions in `tests/fixtures/ddg_symptom_queries.yaml`: 206 watchstander questions written from the procedure titles before the symptom lists were read, 35 questions that must be refused, and 3 known near misses.
Run on 2026-11-05 on the freshly built ddg index (103 procedures, 779 steps):

| Measure | Result |
| --- | --- |
| Right procedure first (hit@1) | 189 of 206 = 91.7% |
| Right procedure in the top two (hit@2) | 202 of 206 = 98.1% |
| Marked ambiguous | 25 of 206 |
| Refusal questions refused | 35 of 35 |
| Near misses answered (should be refused) | 3 of 3 |
| Retriever latency | p50 16.8 ms, p95 27.0 ms, max 85.7 ms (load average 66) |
| `POST /api/query` with policy and signed audit | p50 22.2 ms, p95 35.5 ms, max 61.2 ms |

The 17 misses at rank one fall into three kinds.

- **Right card second, marked ambiguous (9).** The Sailor sees both cards and picks one.
  Example: "MRG LO pressure dropping on shaft 2" gives pump failure (`EOCC-MRG-LOPF`) first and low pressure (`EOCC-MRG-LLOP`) second.
  This is the demo's beat 8.
- **Right card second, marked clear (4).** These are the dangerous ones, because the screen says clear.
  "gas turbine generator running away, frequency climbing" gives governor failure before overspeed; "SSGTG lost excitation" gives low fuel oil pressure before excitation failure; "number 3 gas turbine generator module fire" gives the GTM fire card before the SSGTG fire card; "rig casualty power to the steering gear" gives steering power before casualty power.
  The second card is still listed under the steps.
- **Right card not in the top two (4).** "we lost one of the two online generators" (gives blackout), "SSGTG carrying more than rated kW" (gives generator status), "LPAC discharge temperature high", and "high pressure air compressor failed".

Some misses are wording gaps in the cards, not search faults: the excitation card's symptoms say "generator voltage fluctuating" but never "loss of excitation", and the overspeed card never says "running away".

The three near misses are naval questions outside the corpus that share one word with a card and score above the floor:

- "anchor windlass brake slipping" gives `EOCC-GTM-CLTH` (the power turbine brake card).
- "rig the accommodation ladder" gives `EOCC-FLD-DEWT`.
- "flight deck lighting failed" gives `EOCC-ELEC-BLKO`.

`tests/test_dataset_ddg.py` expects these to fail, so a fix shows up as an unexpected pass.

### The cosine floors

The floor is the last guard against an answer to a question we hold no card for.
It is set per dataset and per embedding model, because cosine values from two models are not comparable.

- **Laptop, 0.64.** The weakest real ddg question scores 0.642.
  Off-topic wikiHow titles that pass the scope gate peak at 0.683 (one known leak, "Tell if Your Power Supply or Motherboard Is Bad", which names a real EPCC alarm) and the next is 0.631.
- **Cloud, 0.59.** The weakest real question scores 0.5945 on the Workers AI model; the off-topic peak is 0.6134 (the same leak), then 0.5964 ("Make Fire in Minecraft").

So the margin is 0.002 on the laptop and 0.005 on the cloud.
That is why [DEMO.md](DEMO.md) says "name the equipment in every typed question".
A bare "the generator" has fewer words to match and can fall under the floor or match the wrong generator card.
`tests/test_scope_offtopic.py` reruns all 2,437 off-topic titles on every test run, and any new leak fails it.

### Phrasing

Measured on the ddg index on 2026-11-05:

| Question | Result |
| --- | --- |
| `low lube oil pressure on number two SSGTG` | `EOCC-SSGTG-LLOP`, clear, cosine 0.857 |
| `LO press low 2 SSGTG` | `EOCC-SSGTG-LLOP`, clear, 0.766 |
| `2 gen low oil` | `EOCC-SSGTG-LLOP`, clear, 0.709 |
| `number two is losing oil pressure` | `EOCC-GTM-LLOP` first, `EOCC-SSGTG-LLOP` second, marked clear, 0.722 |
| `the generator is acting up` | `EOCC-SSGTG-HVIB` and `EOCC-SSGTG-ASTB`, ambiguous, 0.711 |
| `smoke` | `EOCC-FIRE-ELEC`, clear, 0.682 |
| `low lube oil pressure and high bearing temperature on number two SSGTG` | `EOCC-SSGTG-HBRG`, clear, 0.874 |

Two lessons.
First, "clear" means the second card scored under 94% of the first; it is a rank gap, not a sign that the answer is right.
A vague question that names no equipment can get a card marked clear, as "number two is losing oil pressure" and "smoke" show.
Second, a question with two symptoms finds the card that best matches both words, not the cause both symptoms share; the search has no notion of cause.

### The knowledge graph

`make index` writes an `edges` table: 909 edges on the ddg index today.

- 694 `requires` edges, one per step that must follow another step.
- 215 `associated` edges, from the `associated:` lists that 100 of the 103 procedures carry (the "associated casualties" data in the MSC cards). All 215 point to procedures that exist.

No code reads the `edges` table.
The policy engine reads each step's `requires` list from the steps table directly, and search uses only BM25 and cosine.
Cloudflare has no graph at all.
`api/retrieval/README.md` says the `associated` edges drive a "watch for next" list in the UI; that list is not built.
Issue #68 ("knowledge graph that retrieval and the UI actually use", open) is the plan to use it: symptom, cause, and effect nodes; `leads_to` edges; a `watch_next` list; and an evidence path.

## 4. More data, less data

### How we measured

We have no real corpus of 1,000 or 10,000 naval cards, so we measured with what we have.
A probe script built derived index files by copying rows between existing indexes, with the same vectors, so no re-embedding was needed:

- **ddg + wikiHow:** the 103 ddg cards plus the 2,437 wikiHow stand-in lists, 2,540 procedures and 15,217 steps (about 25 times ddg).
- **ddg + wikiHow x4:** the same with four copies of wikiHow, 9,851 procedures and 58,531 steps (about 100 times ddg).
  The copies are duplicates, so this one is good for size and speed only.
- **20-card ships:** five random sets of 20 ddg cards (seeds 0 to 4), to act as a ship that loads only part of the set.

Each derived index ran the same 206 ddg questions and 38 refusal and near-miss questions, with the ddg floors and `scope.yaml`.
The wikiHow set on its own passes its 20 tests (`WSC_DATASET=wikihow`, `tests/test_dataset_wikihow.py`) at its own floor of 0.70.

### Size, build time, and latency

| Index | Procedures | Steps | Index file | Vectors in RAM | Startup | Retriever p50 | Retriever p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ddg | 103 | 779 | 3.4 MB | 1.2 MB | 1.0 s | 17 to 27 ms | 27 to 85 ms |
| ddg + wikiHow | 2,540 | 15,217 | 34.3 MB | 23 MB | 13.5 s | 120 ms | 408 ms |
| ddg + wikiHow x4 | 9,851 | 58,531 | 127.3 MB | 90 MB | 36.2 s | 244 ms | 908 ms |

All rows were measured under a load average of 28 to 66, so an idle laptop is faster.
Split by stage, the query embedding takes a fixed 8 to 70 ms (it depends on load, not on corpus size), the cosine against every step takes 0 to 2.5 ms even at 58,531 steps, and BM25 grows with the corpus: 1.2 ms, 33 ms, and 64 ms.
BM25 in `rank_bm25` scores every step in a Python loop, so it is the part to replace first at scale (section 5).
Even at about 10,000 cards, every query stayed well under the 5 s budget; the slowest was 1.6 s under heavy load.

The index build is almost all embedding.
The embedding model ran at 30 steps per second on this loaded laptop, and the full ddg build took 142 s (about 60 s on an idle laptop).
So 1,000 cards (about 7,500 steps) take about 4 minutes to build, and 10,000 cards about 45 minutes.
That is a one-time cost per corpus change; it can run ashore, and the ship gets the finished index file.

### Accuracy with more cards

With the 2,437 wikiHow lists added, the ddg questions did not get worse: hit@1 went from 91.7% to 93.2%, hit@2 from 98.1% to 97.6%, and ambiguous answers from 25 to 22.
With four copies, hit@1 was 92.7%.
The extra lists are about phones, apps, and cooking, so they rarely compete with an SSGTG card, and they change the BM25 word weights so that rare plant words count for more.

That result does not prove that 10,000 naval cards would be as good.
Unrelated cards are the easy case.
The hard case is near-identical cards: other ship classes carry the same LM2500 engines and generators, and a CG-47 low lube oil card would read almost like the DDG one.
Today 13 of the 17 ddg misses are already close neighbours, and that kind of miss grows with every similar card.
Each procedure row stores its `ship_class`, but search does not filter by it; a multi-class corpus needs that filter so a DDG watch never gets a CG card.

The scope gate also gets weaker as the corpus grows, because its domain words come from every loaded card.
With wikiHow added, the domain words went from 806 to 2,591, and 9 of the 38 refusal questions got an answer instead of 3.
Six of the nine were home questions ("tie a bowline", "reset my email password") that found a real wikiHow list, which is correct for that mixed corpus but shows the gate follows the corpus, not the ship.
For this reason the floors are set per dataset and per model: ddg 0.64 laptop and 0.59 cloud, wikiHow 0.70 and 0.67.
A new ship class or a new large set needs its own refusal questions and its own floor, measured the same way.

### Less data: a ship that loads only 20 cards

Over the five 20-card sets, the questions whose card was loaded found it first 199 times out of 200.
Fewer cards means fewer close neighbours, so the right card wins easily.

The questions whose card was not loaded are the real limit.
Of 830 such questions, 672 (81%) got a different card and 158 (19%) were refused.
Example: with the GTM no-crank card missing, "1B GTM will not crank, no rotation on start" got the GTM light-off failure card at cosine 0.77, far above the 0.64 floor.
The scope gate passes it because it names a GTM, and the floor passes it because a GTM card is close in meaning.
Nothing in the search knows that the ship has no card for that casualty.

The same gap exists at full size for any in-scope casualty with no card: the copilot shows the nearest card and lists the others, and the watch must read the title.
The 35 refusal questions are refused because each names equipment in the `uncovered` list, such as an SSDG or a boiler, or uses no plant word at all.
Section 5 puts this gap first.

## 5. What to add, and when

One rule holds for every item: a model may help find a card or explain one, and it never writes, picks, or reorders a step.
The steps the watch acts on stay corpus rows, and the policy engine and audit log stay as they are.

### For Friday's demo

1. **Add nothing to the answer path.** The measured 91.7% hit@1, 98.1% hit@2, 35 of 35 refusals, and 7 to 12 ms answers are the story.
   A new model in the path before 9:00 AM is risk with no measured gain.
2. **Say the limits out loud.** Judges trust a team that names its limits: the 0.002 floor margin, the 3 near misses, and "clear is a rank gap, not a proof".
   Point to this file.
3. **Fix card wording, not code, if time allows.** Two of the four clear-but-wrong misses ("SSGTG lost excitation", "gas turbine generator running away") are symptom-list gaps in `corpus/ddg/src/`.
   A symptom line plus `make index` and a rerun of the eval is the whole change.
   Any change must rerun `tests/test_scope_offtopic.py`, because it can move the floor margin.

### For a real ship, in order of value

1. **Refuse a casualty the ship holds no card for.** This is the largest measured risk (section 4): with 20 cards loaded, 81% of questions about the missing cards got a wrong card instead of a refusal.
   Generate each ship's `scope.yaml` from the cards it loads, refuse by casualty and not only by equipment, and tune `min_cosine` per ship from a held-out question set.
   No model needed.
   Size: medium.
2. **Use the graph to separate close cards (issue #68).** Most misses are close neighbours: LLOP against pump failure, GTM fire against SSGTG fire.
   When two cards are close, ask the one symptom that tells them apart ("Is bearing temperature rising too?"), from the cards' own symptom and cause lists.
   Add "watch for next" from the 215 `associated` edges that already exist.
   Every edge comes from the source text, so no model guesses.
   Size: medium to large.
3. **Faster keyword search before 10,000 cards.** Replace the in-memory `rank_bm25` loop with an inverted index (SQLite FTS5 is in the standard library) so BM25 cost follows the query words and not the corpus size.
   Size: small to medium.
4. **A local reranker, measured first.** Rescore the top 20 fused steps with `cross-encoder/ms-marco-MiniLM-L6-v2` (91 MB, CPU), as the README's stretch goal says.
   It reorders cards; it writes nothing.
   Keep it only if it raises hit@1 on the 206 questions without new leaks, and re-tune the floors after.
   Expect tens of ms per question on a CPU.
   Size: small to build, medium to prove.
5. **Query rewrite for poor phrasing, with a guard.** A small local model turns "number two is losing oil pressure" into a query that names the equipment, or asks which unit.
   The guard: the rewrite is only a search input, never shown as an answer; the original question is also searched, and the card must pass the same floors; both texts go in the audit entry; past 2 s it is skipped.
   [DEMO.md](DEMO.md) expects a 3B model on a laptop CPU to miss that 2 s budget often, so this needs a faster machine or a smaller model.
   Size: medium.
6. **An explainer, last and labelled.** A model may summarize a card or explain a step in plain words, in a separate panel marked "model text, not doctrine", after the steps are shown, and never as input to the policy engine.
   Of all the items it adds the most trust risk and the least casualty-control value.
   Size: medium.

## How to rerun these numbers

```bash
make index
```

```bash
WSC_DATASET=ddg .venv/bin/python scripts/eval_ddg.py
```

```bash
WSC_DATASET=wikihow make test
```

The scale probe that made the derived indexes in section 4 copied rows between index files without re-embedding; it is not in the repo.

