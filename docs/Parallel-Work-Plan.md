# Parallel Implementation Work Plan

This plan splits the hackathon work into three pairs that can proceed in parallel. Protect the typed, offline, source-cited path first; add voice, optional rewrite, or reranking only after it passes.

## Team roles

- **Pair A — Retrieval and evidence:** RAG engineer (lead) + data analyst.
- **Pair B — Policy and trust:** general coder (lead) + LLM engineer.
- **Pair C — UI and offline delivery:** front-end engineer (lead) + containers engineer.
- **Integrator:** designate one person before the split. Following the repository workflow, lane 3 owns shared API route wiring and merges. The integrator may also belong to a pair, but must reserve time for integration.

## Before the pairs split off

Do these steps together; target about 30 minutes.

1. **Agree on the minimum demo.** It must answer a known casualty query with exact source citations, refuse an unknown query, block an out-of-sequence action, verify the audit chain, and run with Wi-Fi disabled.
2. **Inspect current code.** Review retrieval, policy, trust, UI, tests, and the API contract. Mark each item working, partial, or missing. The repo already has a happy-path backend, so assign gaps and verification rather than reimplementing completed work.
3. **Name owners.** Assign a lead and partner in each pair. Name the integrator for route wiring and one operator for the final demo laptop. Each deliverable gets one final owner.
4. **Freeze API contracts.** Use docs/CONTRACTS.md. Confirm request and response shapes for GET /api/health, POST /api/query, POST /api/action, GET /api/audit, and GET /api/audit/verify. Tell all pairs and update the contract before any shared field changes.
5. **Freeze shared data meaning.** Confirm stable procedure_id and step_id values; source, requires, and danger fields; step states done/next/locked; and the response for a query with no match. Preserve source text exactly.
6. **Set the model boundary.** Retrieval selects approved procedure rows. Policy makes deterministic allow/reject decisions. Optional LLM wording must not create or alter an authoritative step, approve an action, or enter the action endpoint.
7. **Assign file ownership.** Pair A owns retrieval, corpus, and evaluation files. Pair B owns policy, signing, and audit files. Pair C owns UI and run/package configuration. The integrator alone wires routes in the application entrypoint to avoid merge conflicts.
8. **Create the acceptance set.** Agree on three in-corpus symptom queries and their expected procedures, one out-of-corpus query, and an out-of-order step attempt. Store these fixtures in one agreed location.
9. **Set branches and checkpoints.** Each pair opens a focused branch and PR. Set short integration check-ins (for example, every 45 minutes) and a feature-freeze time. Keep the happy path working at each checkpoint.
10. **Rank scope.** Required: typed query, exact citations, no-answer behavior, policy gate, signed/hash-chained audit, UI, and offline startup. Then measure ten-query latency. Stretch: voice, optional rewrite, second ship-class corpus, reranker. Defer fine-tuning and separate vector/graph services.

## Pair A — Retrieval and evidence (RAG + data analysis)

**Goal:** deliver measurable retrieval over approved procedure rows.

1. Trace corpus parsing, abbreviation expansion, indexing, query normalization, BM25, embeddings, fusion, grouping, and citation creation. Record what passes and what is incomplete.
2. Check procedure front matter and stable source labels. Check step IDs, order, requires references, and danger annotations. Ask the doctrine owner to resolve content questions; never invent procedure text.
3. Make indexing repeatable. One command should rebuild the SQLite index from the selected corpus and report procedure, step, and edge counts. Record the corpus version or hash if supported.
4. Complete the query pipeline: normalize with the shared abbreviation map; rank with BM25 and semantic similarity; fuse ranks; group by procedure; return ordered step rows with exact source strings.
5. Define grounded no-answer behavior. An unknown query returns no procedure and no steps. Do not fill the gap with an LLM guess.
6. Build a retrieval evaluation table. For each symptom query, record expected procedure/steps, actual top result, citation correctness, and latency. Include an out-of-corpus query. Add a conflict case only when curated sources really conflict.
7. Compare returned source and step strings against the corpus. Ensure the UI's scores/ranks are actual retrieval outputs, not uncalibrated confidence claims.
8. Hand the integrator a callable retrieval function, result shape, indexing/startup instructions, sample queries, and evaluation notes. Leave route registration to the integrator.

**Deliverables:** repeatable index build, retrieval service, grounded no-answer result, evaluation table, citation audit notes.

## Pair B — Policy and trust (general coding + LLM)

**Goal:** a retrieved step cannot bypass sequence checks, and each outcome can be verified.

1. Inspect existing action validation, operator state, signatures, audit append, and verification. Identify completed pieces before editing.
2. Enumerate policy cases from the contract: unknown step, wrong procedure, already acknowledged step, missing prerequisite, danger condition, allowed next step, and reset. Agree on rejection reasons.
3. Implement or complete the deterministic state machine using procedure rows and requires/danger metadata. Track acknowledgements by operator and procedure. Keep policy independent of any LLM.
4. Verify both paths: allowed actions advance step state; rejected actions return a clear reason and leave state unchanged. Both create signed audit references.
5. Check audit fields: sequence, timestamp, actor, event, payload hash, previous hash, current hash, signer, and signature. Verification reports success or the first broken sequence.
6. Check the happy path, out-of-order attempt, unknown and cross-procedure steps, and tampering in a disposable log copy. Keep generated audit logs out of source control.
7. If the LLM engineer builds optional rewrite or zero-context baseline material, label it unverified and keep it outside the action flow. Retrieved source text remains authoritative.
8. Give the UI pair the exact action/audit fields, state transitions, rejection reasons, and verification command or endpoint. Keep route wiring with the integrator.

**Deliverables:** policy service, signed action outcomes, verifiable audit records, focused checks, documented model-output boundary.

## Pair C — UI and offline delivery (front-end + containers)

**Goal:** make evidence and safety behavior clear, and make the demo repeatable offline.

1. Check the current UI and run path: start commands, API base URL, production serving, and concrete gaps. Do not replace the shell without a reason.
2. Build the query screen with typed symptom input, loading/error states, and visible offline status. Typed input remains available even if voice is added.
3. Show evidence beside the result: procedure title, exact step text and IDs, source label, metadata that exists, match evidence returned by the API, and latency. Never fabricate page numbers or citations.
4. Render no-match clearly: “No matching procedure in the indexed sources,” with no steps or action buttons.
5. Show done/next/locked states. Call POST /api/action for acknowledgement; distinguish allowed progression from rejection and show the API reason.
6. Expose trust signals: operator ID, signer/signature status, audit sequence/reference, and a verification affordance or clear command.
7. Polish for the room with large touch targets, readable contrast, and red-light mode after the core flow works.
8. Package one documented command to start API and UI together. Ensure dependencies and required model assets are already available before Wi-Fi is disabled; no runtime downloads.
9. With the integrator, perform a clean launch on the demo laptop, disable Wi-Fi, and run query/action/audit beats. Record commands and known limitations.
10. Keep a known-good typed demo and backup recording. Add voice only if it works locally without breaking typed fallback or the latency target.

**Deliverables:** integrated UI, visible evidence and state, one-command offline launch, clean-run notes, demo fallback.

## Integration sequence after the split

1. Pair A hands the integrator the retrieval service and result shape.
2. Pair B hands over policy, signing, and audit interfaces.
3. The integrator wires POST /api/query through retrieval and signing, and POST /api/action through policy and signing. Pair C can work against the frozen contract or a stub meanwhile.
4. Pair C connects the UI to real endpoints and checks that the screen matches API states.
5. Run the acceptance set end to end: known query, source inspection, unknown query, blocked out-of-order action, allowed next action, and audit verification.
6. Disable Wi-Fi and repeat. Measure ten queries and record actual latency.
7. Fix blockers to the required demo first. Reconsider voice, rewrite, second corpus, and reranking only if there is time and latency headroom.
8. Freeze the build and preserve a known-good backup.

## Definition of a successful split

Each pair returns a reviewable PR, the deliverables above, a short run/check instruction, and known gaps. The integrator combines the PRs without changing the frozen contract or inventing missing behavior. The team demonstrates the core source-grounded flow with Wi-Fi off.
