# Build Plan

## Product objective

Deliver an offline, source-grounded casualty copilot for the EOOW. It must return a cited procedure match in under five seconds, prevent unsafe or out-of-order steps, and make each response and operator action auditable.

## Architecture choice

The team lead's five-agent proposal is represented as five responsibilities, not five serial LLM calls. Retrieval handles symptom intent. Ordered procedure data and a deterministic policy state machine handle planning and verification. `/api/action` records the operator's requested acknowledgement. Answer synthesis returns exact source steps, with an optional bounded rewrite only as a stretch feature.

The proposed vector database, semantic database, and knowledge graph are implemented in one SQLite index: vectors are attached to step rows, while `requires` and `associated` relationships are rows in the `edges` table. This keeps one source of truth for retrieval and policy.

A fine-tuned cross-encoder is not part of the required build. First prove hybrid retrieval and latency. If the Wednesday gate passes, test the off-the-shelf `cross-encoder/ms-marco-MiniLM-L6-v2` as a Thursday stretch reranker. Fine-tuning would add data, training, and validation work without being needed to demonstrate the hard requirements.

## Milestones and gates

### Gate 1 — Wednesday 3:00 PM: stubs

- Freeze API contracts.
- `/api/query` and `/api/action` return contract-shaped responses.
- Procedure 1 loads into the shared SQLite schema.
- Required models are present on the demo laptop and USB while Wi-Fi is available.

**Pass:** curl reaches both endpoints and indexing prints the expected row count.

### Gate 2 — Wednesday 8:00 PM: typed end-to-end demo

- Hybrid search returns cited steps for the three casualty scenarios.
- Signatures and hash-chained audit records are live.
- Policy rejects an out-of-sequence action.
- Typed demo works with Wi-Fi off.

**Pass:** the demo script completes offline and `make verify` succeeds.

### Gate 3 — Thursday 2:00 PM: submission candidate

- Push-to-talk uses local speech recognition; typed input remains visible.
- Corpus-source audit and tamper-evidence demo are polished.
- Ten-query measurement supports p95 under five seconds.
- Portal submission is ready by the planned deadline.

**Pass:** every demo beat works offline, including voice. If a feature threatens the core pass criteria, cut it before submission.

### Gate 4 — Friday 9:00 AM: finals readiness

- Three timed rehearsals are complete.
- Demo laptop is sealed in airplane mode by Thursday 7:00 PM.
- Reranking is included only if Gates 1–3 remain green and latency has headroom.

## Work lanes

| Lane | Responsibility |
| --- | --- |
| 1 | Pitch, submission, and Slack coordination |
| 2 | Doctrine files, scenarios, and abbreviation map |
| 3 | Retrieval engine, SQLite index, and integration; merges PRs |
| 4 | Trust layer, audit signatures, and policy engine |
| 5 | Test cases, demo operator, latency sheet, and rehearsal |
| 6 | Sailor UI, typed input, voice, and display of evidence |

Keep one branch per lane and merge through reviewed PRs. The repository README states that lane 3 merges to `main` and `main` must continue to run `make demo`.

## Demo evidence

The final presentation should include three distinct demonstrations:

1. A clearly labeled zero-context baseline that is visibly unverified and cannot trigger an action.
2. A side-by-side retrieved result with exact source text and available metadata.
3. An unknown or conflicting-source edge case that shows graceful uncertainty, followed by an out-of-sequence action that the policy engine rejects.

Record latency and offline status as evidence, not as claims inferred from a single successful request.

## Scope controls

- Required: source-grounded hybrid retrieval, policy enforcement, signed response/action audit, typed UI, offline path, and latency measurement.
- Planned extension: local speech input.
- Optional: bounded answer rewrite and a second ship-class corpus.
- Stretch: off-the-shelf reranking after the core gates pass.
- Out of scope for the required demo: five separate agents, multiple separately operated databases, fine-tuning a cross-encoder, or letting generated text substitute for an approved procedure.

