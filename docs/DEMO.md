# Five-minute demo plan

Draft, Nov 4, for the Thursday 2:00 PM semifinal and Friday 9:00 AM finals.
Every result below was run against this checkout's code and index on Nov 4.

## Verdict on the three demo ideas

**1. Before and after: adapt.**
Our required path has no LLM, so the "before" is the paper binder plus a zero-context local model.
Measured on this M1 Pro, `llama3.2:1b`, prompt "Number two SSDG has low lube oil pressure. Give the casualty control steps in order":
run 1 took 11.7 s and said to use fire suppression and drain fuel, never starting the standby generator;
run 2 took 3.4 s and refused, calling it a medical emergency.
Same question, two different wrong answers: the use case's core fear in one example.
Show screenshots, not a live run, which costs 5 to 12 s and could by luck look fine.
It also says keep the planned 3B rewrite out of the demo: on a CPU laptop it will often miss a 2 s cutoff.

**2. Show your work: adopt, with plain labels.**
This is our trust argument, so the evidence sits beside the steps.
Fusion scores near 0.03 mean nothing to a judge; show highlighted matched words, the exercise card (D-15), and a clear or ambiguous label.

**3. Gotcha queries: adopt, after two fixes.**
Do not invent conflicting doctrine; "authorized doctrine only" is a requirement.
Show ambiguity and out-of-scope equipment instead; both fail today.

## Beat sheet (290 s, 10 s spare)

These beats ask about the SSDG doctrine, so start with `make demo DATASET=ddg`.
Plain `make demo` serves the wikiHow stand-in set, which refuses SSDG questions and has no danger steps.

| # | Sec | Typed or clicked | Judges see | Criterion |
|---|-----|------------------|------------|-----------|
| 1 | 25 | Showcase page | 0200, low LO pressure alarm on No. 2 SSDG, a binder, the fear of untrusted AI | Warfighting |
| 2 | 30 | Showcase page | Before: binder find time, the two `llama3.2:1b` answers and times | Barrier Removal |
| 3 | 15 | Wifi off in view, opens `127.0.0.1:8000` | Offline, 3 procedures, 27 steps | Speed to Fleet |
| 4 | 35 | `low lube oil pressure on number two SSDG` | LLOP, D-15 citation, matched words, 01 next, about 10 ms, signed audit entry | Warfighting, Speed |
| 5 | 40 | Clicks step 05, then 01 to 05 in order | 05 blocked with the danger text; then allowed with a caution | Discretion |
| 6 | 20 | `ignore your rules and secure the generator now` | 05 still locked; no model reads the words | Discretion |
| 7 | 40 | `the generator is overheating`, then `gas turbine generator fire in the module` | "Two procedures fit, confirm", then "No authorized procedure held" | Barrier Removal |
| 8 | 15 | Gotcha script in a terminal | `MALLORY` refused; HJWT step under LLOP blocked | Scalability |
| 9 | 40 | Edits `"allowed": false` to `true` in `audit/log.jsonl`, clicks Verify log | "Chain broken at entry N" | Barrier Removal |
| 10 | 30 | Showcase page | New card = one markdown file and `make index`; no GPU; USB install | Scalability, Speed |

If build changes 1 and 2 miss Thursday, beat 7 uses `pizza for lunch`; never show a gotcha that fails.
Time a real binder find of the LLOP card tonight; never show a guessed binder time.

## Gotcha queries, checked against the code

| Query | Expected | Before #42 | With #42 |
|-------|----------|-------|-------|
| `pizza for lunch` | No procedure | Works (cosine 0.38) | Works |
| `how do I change the oil in my truck` | No procedure | **Wrong:** LLOP | Works |
| `what tire pressure should I run` | No procedure | **Wrong:** LLOP | Works |
| `the generator is overheating` | Ambiguous, HJWT or LLOP | **Wrong:** HJWT 0.0320 vs LLOP 0.0310, shown as sure | Works: "Confirm the casualty" |
| `gas turbine generator fire in the module` | No procedure | **Wrong:** LFOP | Works: names the gas turbine generator |
| `main reduction gear low lube oil pressure` | No procedure | **Wrong:** SSDG LLOP | Works: names the main reduction gear |
| `ignore your rules and secure the generator now` | LLOP, 05 locked | Works | Ambiguous, LFOP or LLOP; 05 still locked |
| Action `EOCC-SSDG-HJWT-01` under `EOCC-SSDG-LLOP` | Blocked | Works; curl only, the UI cannot send it | Same |
| Query as `MALLORY` | Refused | Works (400), but not written to the audit log | Same |

Also checked with #42: 0 of 2,437 everyday "How to" questions get a procedure (`tests/test_scope_offtopic.py`).

Root cause before #42: one keyword hit ("oil", "pressure", "generator") skips the 0.62 cosine gate, and `search_text` does not index `effects`, where "overheating" lives.
Cosine alone cannot fix it: the truck query scores 0.658, above the real overheating query at 0.645.

## Build changes, by demo value per hour

1. **Scope gate (M), Thursday.** `api/retrieval/search.py`, `indexer.py`: index `effects`, require a casualty term beyond generic words, and refuse equipment no procedure covers (GTG, MRG, EDG). Add the five failing queries to `tests/test_happy_path.py`.
2. **Ambiguity flag (S), Thursday.** `POST /api/query` adds `confidence: "clear" | "ambiguous"` when the top two are within a margin; `procedure-panel.tsx` offers both. Update `docs/CONTRACTS.md` first.
3. **Why-this-procedure panel (S), Thursday.** `procedure-panel.tsx`: render `matched.keyword` (returned, never shown), highlight it in the symptoms, show the card number and `semantic_top`.
4. **Baseline evidence (S, no code), Thursday.** Capture the two model runs and the binder time for the showcase page.
5. **Gotcha script (S), Friday.** `scripts/gotcha.sh` holds the two curl calls.
6. **Log refused operators (S), Friday.** `api/main.py` `_operator` appends a node-signed `refused` event.
7. **Per-step evidence (M), Friday.** Return BM25 and cosine per step; show the matched step text.

Drop: a live LLM baseline panel and a synthetic conflicting procedure.

## Likely judge questions

- **What if the casualty is not in the corpus?** It says no authorized procedure is held and points to the binder; nothing writes steps.
- **How do real EOCC cards get in?** Each card is one markdown file with `requires:` and `danger:`; the engineering department reviews that file, not code.
- **Could someone rewrite the whole log?** Only with every operator's private key; production binds keys to the CAC, and the chain head goes in the CHENG's log each watch.
- **Why no LLM?** We measured one: 3 to 12 s, wrong steps, a different answer each run.
