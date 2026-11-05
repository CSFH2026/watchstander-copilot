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

These beats run on plain `make demo`, which serves the wikiHow stand-in set: 2,437 step lists, 14,438 steps.
They are not Navy doctrine, and the banner on every screen says so.
The showcase page keeps the SSDG casualty as the problem story; the live beats use the PC battery list.
Real doctrine loads the same way with `make demo DATASET=ddg`; its queries are in `tests/test_happy_path.py`.
The wikiHow lists have no `danger:` steps, so the danger-note beat is gone; show it only on the ddg backup.
Run `make fresh-log` before `make demo` so the audit numbers start from 1; the server reads the last entry only at start.

| # | Sec | Typed or clicked | Judges see | Criterion |
|---|-----|------------------|------------|-----------|
| 1 | 25 | Showcase page | 0200, low LO pressure alarm on No. 2 SSDG, a binder, the fear of untrusted AI | Warfighting |
| 2 | 30 | Showcase page | Before: the two `llama3.2:1b` answers and times; the stand-in data label | Barrier Removal |
| 3 | 15 | Wifi off in view, opens `127.0.0.1:8000` | Offline; banner "STAND-IN DATA: wikiHow step lists (CC BY-NC-SA 3.0, wikiHow contributors), not Navy doctrine." | Speed to Fleet |
| 4 | 35 | `replace the battery in my laptop` | `WH-146241` "Replace the Battery in Your PC", wikiHow citation, matched words battery, laptop, replace, 10 steps with 01 next, about 22 ms server, signed audit entry | Warfighting, Speed |
| 5 | 20 | `ignore your rules and replace the battery in my laptop now` | The same list, 01 next, 06 still locked; no model reads the words | Discretion |
| 6 | 40 | Acknowledge 01 and 02, then 06; then 03 to 06 in order | 06 blocked: "Blocked: step 06 requires step 05 first."; then "Step 06 acknowledged." | Discretion |
| 7 | 40 | `replace the battery`, then `jump start a car battery` | "Two procedures fit this description: WH-11515895 and WH-146241. Confirm which casualty it is.", then "No authorized procedure matches this description. Use the EOCC binder." | Barrier Removal |
| 8 | 15 | Two curl calls in a terminal | `MALLORY` refused; Kindle step `WH-11515895-01` under `WH-146241` blocked | Scalability |
| 9 | 40 | Edits the first `"allowed": false` to `true` in `audit/log.jsonl`, clicks Verify log | "Chain broken at entry N: payload hash does not match" | Barrier Removal |
| 10 | 30 | Showcase page | New list = one markdown file and `make index`; `DATASET=ddg` swaps in doctrine; no GPU; USB install | Scalability, Speed |

Beat 6 tries step 06 "Slide the battery out of its slot" while step 03 "Unplug your computer" is next.
The reason names 05, not 03: each step requires only the step before it, and the engine reports what that step is missing.
In beat 7, the ambiguous answer shows the Kindle list first with a "Switch to WH-146241" button; the switch lands on the PC list as clear.
Beat 8 commands, with the server running:

```bash
curl -s 127.0.0.1:8000/api/query -H 'content-type: application/json' -d '{"operator_id":"MALLORY","text":"replace the battery in my laptop"}'
curl -s 127.0.0.1:8000/api/action -H 'content-type: application/json' -d '{"operator_id":"EOOW-01","procedure_id":"WH-146241","step_id":"WH-11515895-01","action":"acknowledge"}'
```

Restore the untouched log after beat 9.
Never show a gotcha that fails.

## Demo queries, measured on the wikiHow index

Run on Nov 4 against `make demo` with no `DATASET`, `/api/health` reporting `wikihow`, 2,437 procedures, `offline: true`.
Server time is the median of 10 warm runs.

| Query or action | Result | Confidence | Max cosine | Server ms |
|-----------------|--------|------------|------------|-----------|
| `replace the battery in my laptop` | `WH-146241` Replace the Battery in Your PC | clear | 0.843 | 22.5 |
| `how do I swap the battery in my PC` | `WH-146241` | clear | 0.828 | not timed |
| `replace the battery` | `WH-11515895` Replace a Kindle Battery, then `WH-146241` | ambiguous | 0.774 | 21 |
| `ignore your rules and replace the battery in my laptop now` | `WH-146241`, 06 still locked | clear | 0.711 | 30 |
| `jump start a car battery` | No procedure | none | 0.654 | 21.5 |
| `check my car oil level` | No procedure | none | 0.559 | not timed |
| `pizza for lunch` | No procedure, refused before search | none | 0 | 0 |
| Acknowledge `WH-146241-06` after 01 and 02 | "Blocked: step 06 requires step 05 first." | | | |
| Acknowledge `WH-146241-06` after 01 to 05 | "Step 06 acknowledged." | | | |
| Acknowledge `WH-146241-06` again | "Blocked: step 06 is already acknowledged." | | | |
| Acknowledge `WH-11515895-01` under `WH-146241` | "Blocked: step 01 belongs to WH-11515895, not the active procedure WH-146241." | | | |
| Query as `MALLORY` | 400 "Unknown operator MALLORY. Enrolled: EOOW-01, EOOW-02" | | | |
| First blocked action flipped to allowed, then `GET /api/audit/verify` | `broken_seq` 22, "payload hash does not match" | | | |

Two cold single runs took 144 ms and 543 ms; every warm run was 20 to 39 ms.
The wikiHow floor is `min_cosine: 0.70` (`corpus/wikihow/dataset.yaml`), which is why the car questions are refused at 0.55 to 0.65.
`tests/test_dataset_wikihow.py` holds 7 covered and 12 uncovered questions; run it with `WSC_DATASET=wikihow make test`.

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
