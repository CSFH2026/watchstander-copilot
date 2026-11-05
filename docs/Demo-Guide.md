# Demo Guide

## Goal

Show that Watchstander Copilot makes a casualty procedure easier to find while keeping each recommendation tied to approved source material, refusing unsupported questions, and blocking an unsafe action sequence. Run the core demo on the prepared laptop with Wi-Fi off.

## Set up

1. Run `make setup` while network access is available so dependencies and approved local model files are present.
2. Run `make index` and confirm the expected procedure, step, and edge counts. The wikiHow default takes about 4 minutes the first time, so do it before the demo; add `DATASET=ddg` for the doctrine.
3. Start with `make demo`. It serves the wikiHow stand-in set, and the beats below use it. The server prints `serving dataset wikihow (stand-in): 2437 procedures, 14438 steps`. Check that `GET /api/health` reports `offline: true`, that dataset, and the model `BAAI/bge-small-en-v1.5`. Real doctrine loads the same way with `make demo DATASET=ddg` (3 SSDG procedures, 27 steps); its queries are in `tests/test_happy_path.py`.
4. Disable Wi-Fi and confirm typed query, action checks, audit display, and `make verify` still work.
5. Have a second laptop or USB copy and a recorded backup available.

## Beat 1: zero-context baseline

Ask a domain-specific casualty question in a clearly labeled baseline mode with retrieval disabled. Capture the model's answer or uncertainty, then immediately label it **unverified; not operating guidance**. Do not present a guessed action as a procedure or invite the operator to execute it.

The purpose is to establish why source retrieval matters. Keep the baseline separate from the operational copilot path: it is not signed as an approved recommendation and must not enter the action flow.

## Beat 2: sourced answer and “show your work”

Enter `replace the battery in my laptop`. Expected: `WH-146241` “Replace the Battery in Your PC”, confidence clear, 10 steps with step 01 next, matched words battery, laptop, and replace. The banner labels it stand-in data, not Navy doctrine. Show the result beside its evidence:

- Selected procedure title and source.
- The exact step text and step identifiers returned from the corpus.
- Keyword and semantic match evidence, with rank or score where the API exposes it.
- Any displayed source metadata, such as document title and page number, when present in the source data.
- Response latency, operator identity, signature status, and audit sequence.

Use the source strings from the indexed procedure. Do not imply a page number exists unless the source metadata actually contains it. Show that a valid query returns sourced steps and that the UI does not silently turn a model paraphrase into procedure text.

## Beat 3: gotcha and safe refusal

Run both edge cases:

1. Ask `jump start a car battery`, which no list covers. Expected behavior: no procedure, no steps, and “No authorized procedure matches this description. Use the EOCC binder.”
2. Ask `replace the battery`, which two lists fit. Expected behavior: “Two procedures fit this description: WH-11515895 and WH-146241. Confirm which casualty it is.” The Kindle list shows first with a “Switch to WH-146241” button; the switch lands on the PC list.

The corpus holds no conflicting versions, so do not invent one. The ambiguous case shows how the copilot defers when more than one source fits.

## Beat 4: policy gate and audit

Query `replace the battery in my laptop`, acknowledge steps 01 and 02, then try step 06 “Slide the battery out of its slot” while step 03 “Unplug your computer” is next. Expected: “Blocked: step 06 requires step 05 first.” Each step requires the one before it, so the reason names 05. Show that the rejection is signed and logged. Acknowledge 03 to 05 in order, try step 06 again, and show “Step 06 acknowledged.” The wikiHow lists have no `danger:` steps; a danger note on a refusal shows only on `DATASET=ddg`.

Finish with `make verify` or `GET /api/audit/verify` and show that the audit chain validates. If time permits, change the first `"allowed": false` to `true` and demonstrate that verification names the broken sequence (`payload hash does not match`); restore the untouched log afterward.

## Suggested narration

1. “Here is the same domain question without the procedure corpus; this view is unverified and never drives an action.”
2. “Now retrieval returns procedure rows with the source visible beside each step.”
3. “When the indexed corpus cannot answer, the copilot says so.”
4. “A retrieved step still cannot bypass the sequence gate; accepted and rejected actions are both auditable.”
5. “The required path is running locally with Wi-Fi off.”

## Pass criteria

- Core flow works with Wi-Fi disabled.
- Known symptoms rank the expected procedure first.
- Returned steps and citations match source files.
- Unknown queries return no procedure and no steps.
- Out-of-sequence and forbidden actions are rejected with a reason and audit entry.
- Signatures and audit chain verify.
- Ten-query latency results support the under-five-second target.

