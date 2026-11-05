# Demo Guide

## Goal

Show that Watchstander Copilot makes a casualty procedure easier to find while keeping each recommendation tied to approved source material, refusing unsupported questions, and blocking an unsafe action sequence. Run the core demo on the prepared laptop with Wi-Fi off.

## Set up

1. Run `make setup` while network access is available so dependencies and approved local model files are present.
2. Run `make index` and confirm the expected procedure, step, and edge counts. The wikiHow default takes about 4 minutes the first time, so do it before the demo; add `DATASET=ddg` for the doctrine.
3. Start with `make demo` (wikiHow) or `make demo DATASET=ddg` (the SSDG doctrine). The server prints the dataset it serves. Check that `GET /api/health` reports `offline: true`, that dataset, and the expected procedures and model.
4. Disable Wi-Fi and confirm typed query, action checks, audit display, and `make verify` still work.
5. Have a second laptop or USB copy and a recorded backup available.

## Beat 1: zero-context baseline

Ask a domain-specific casualty question in a clearly labeled baseline mode with retrieval disabled. Capture the model's answer or uncertainty, then immediately label it **unverified; not operating guidance**. Do not present a guessed action as a procedure or invite the operator to execute it.

The purpose is to establish why source retrieval matters. Keep the baseline separate from the operational copilot path: it is not signed as an approved recommendation and must not enter the action flow.

## Beat 2: sourced answer and “show your work”

Enter a known casualty symptom, such as “low lube oil pressure on number two SSDG.” Show the result beside its evidence:

- Selected procedure title and source.
- The exact step text and step identifiers returned from the corpus.
- Keyword and semantic match evidence, with rank or score where the API exposes it.
- Any displayed source metadata, such as document title and page number, when present in the source data.
- Response latency, operator identity, signature status, and audit sequence.

Use the source strings from the indexed procedure. Do not imply a page number exists unless the source metadata actually contains it. Show that a valid query returns sourced steps and that the UI does not silently turn a model paraphrase into procedure text.

## Beat 3: gotcha and safe refusal

Run both edge cases:

1. Ask about a casualty or fact that is absent from the knowledge base. Expected behavior: no matching procedure, no steps, and a clear “not found in indexed sources” response.
2. If the corpus contains conflicting versions or sources, ask a question that exposes the disagreement. Expected behavior: show both source references, flag the conflict, and defer rather than choosing an unsupported answer.

Do not invent a conflict for the production corpus. If there is no real conflicting pair, demonstrate the missing-source case and explain how conflict handling will be evaluated when curated conflicting fixtures are added.

## Beat 4: policy gate and audit

Query a procedure, then attempt a step before its `requires:` prerequisite is acknowledged (the current planned demo uses step 4 before step 3). Show the human-readable rejection reason and that the rejection is signed and logged. Acknowledge prerequisites in order, try the step again, and show the allowed state transition.

Finish with `make verify` or `GET /api/audit/verify` and show that the audit chain validates. If time permits, alter a copy of one audit entry and demonstrate that verification names the broken sequence; restore the untouched log afterward.

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

