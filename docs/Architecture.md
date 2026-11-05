# Architecture

## Decision

Build the one-table retrieval and trust path already represented in the repository. Preserve the useful responsibilities from the five-agent proposal as bounded functions, but do not put five LLM calls in series on the required query path.

The target is a source-grounded answer in under five seconds, fully offline. Additional model hops increase latency and give a model more opportunities to invent or distort a procedural step. Deterministic retrieval, policy checks, signatures, and audit records make the trust claim inspectable.

## Request flow

```text
Sailor UI
  ├── typed symptom ──────────────────────────────────────────────┐
  └── push-to-talk → local speech-to-text → transcript             │
                                                                    ▼
                                                        POST /api/query
                                                                    │
        normalize abbreviations → BM25 + embedding similarity       │
                                      → reciprocal-rank fusion      │
                                      → group and cite step rows    │
                                      → sign and audit              │
                                                                    ▼
                                                   cited steps + UI

Operator action → POST /api/action → policy state machine
                                    ├── allow → sign + audit
                                    └── reject with reason → sign + audit
```

The UI shows the selected procedure, ordered steps, source strings, matched terms, response latency, signer, and audit reference. Actions are separate from retrieval so that a relevant step is never mistaken for permission to execute it.

## Mapping the proposed agents to the build

| Proposed role | Build implementation | Runtime model? |
| --- | --- | --- |
| Intent recognition | Normalize shorthand and rank candidate procedure steps using BM25 plus embeddings | No LLM required |
| Planner | Order procedure steps and read prerequisite edges; policy state machine decides what is currently allowed | Deterministic |
| Execution | `/api/action` records an operator acknowledgement/action request after policy validation | Deterministic; human remains in the loop |
| Verifier | Signature verification, audit-chain verification, and policy checks | Deterministic |
| Answer synthesis | Return retrieved procedure text and citations; optional local plain-language rewrite is a bounded stretch feature | Optional; never changes the authoritative step text |

This keeps the five responsibilities visible without requiring a five-agent chain.

## Data stores and retrieval

There is one SQLite file, `api/data/index.sqlite`, serving as the semantic store and retrieval index:

- `procedures`: procedure identity, ship class, title, source, symptoms, causes, and file path.
- `steps`: step identity, procedure, sequence, authoritative text, danger text, normalized search text, and embedding vector.
- `edges`: `requires` and `associated` links. The `requires` graph drives policy checks; `associated` links can support related-casualty navigation.
- `meta`: model, dimensions, corpus hash, and build timestamp.

The knowledge graph is represented by the SQLite `edges` table. The semantic search index is the embedding column and vector matrix. No separate vector database or graph service is needed for the demo; one loader and one source of truth reduce integration risk.

### Index time

`make index` reads `corpus/<ship_class>/*.md`, parses front matter and numbered steps, expands abbreviations, creates one search text per step, embeds it with `BAAI/bge-small-en-v1.5`, and stores procedure, step, vector, and graph data in SQLite.

### Query time

The query is normalized with the same abbreviation map. BM25 and cosine similarity rank the indexed step rows. Reciprocal rank fusion combines the rankings. The system groups results by procedure and returns ordered, cited rows from the best matching procedure, plus a ranked list of up to four other procedures that pass the same floors on their own, each with a strength band, its best cosine, and its matched words ([CONTRACTS.md](CONTRACTS.md), `POST /api/query`). The response is signed and timestamped in the audit chain.

## Models and latency

- Required semantic model: `BAAI/bge-small-en-v1.5`, quantized local ONNX through `fastembed` (the artifact lists about 133 MB; the retrieval README describes the quantized download as 64 MB, so use the actual packaged size in the final demo materials).
- Voice: local `faster-whisper` model; typed entry remains available as fallback.
- Optional rewrite: local `qwen2.5:3b`, only when it fits the two-second cutoff. It may rephrase, but the sourced step remains authoritative.
- Stretch reranker: off-the-shelf `cross-encoder/ms-marco-MiniLM-L6-v2` over the top fused candidates, only after the core milestones pass and latency remains within target. Fine-tuning is not on the critical path.

Measure ten queries with Wi-Fi disabled. The acceptance target is under five seconds per response, with p95 under five seconds for the demo scorecard.

## Trust boundary

- The retrieval service may select and quote approved source rows; it must not create procedural instructions.
- The policy engine may allow or reject an action based on procedure identity, step identity, prerequisites, and danger metadata.
- The signing and audit layer records both successful and rejected actions.
- The operator remains responsible for interpreting the casualty and choosing whether to acknowledge a step.
- Any rewrite or model output is supplemental display text, never a new step or policy decision.

