# Backend

FastAPI app. Everything runs on the demo laptop with wifi off. Nothing calls out.

## Layout

| Path | Lane | What |
| --- | --- | --- |
| `main.py` | 3 | FastAPI app, `/query` and `/action`, wires the three packages below |
| `retrieval/indexer.py` | 3 | Parses `corpus/**/*.md` into one chunk per step, embeds, writes `data/index.sqlite` |
| `retrieval/search.py` | 3 | Hybrid search: BM25 keyword score + embedding cosine, returns ranked cited steps |
| `retrieval/rewrite.py` | 3 | Optional local LLM rewrite of the top result, skipped when it exceeds 2 s |
| `policy/engine.py` | 4 | Per-procedure step state machine, `requires:` and `danger:` rules, reasons |
| `trust/keys.py` | 4 | Ed25519 keypair per operator, `roster.json` of public keys |
| `trust/sign.py` | 4 | Signs every response and action |
| `trust/audit.py` | 4 | Append-only hash chain in `../audit/log.jsonl` |
| `trust/verify.py` | 4 | `python -m trust.verify ../audit/log.jsonl` |
| `models/` | 3, 6 | Downloaded model files, gitignored, pulled by `make setup` |
| `data/` | 3 | `index.sqlite`, rebuilt by `make index` |

## RAG pipeline

1. `make index` reads every corpus file, splits on step lines, and stores one row per step:
   `procedure_id`, `step_id`, `text`, `source`, `requires`, `danger`, `symptoms`, `embedding`.
2. `/query` embeds the symptom text, scores every step by BM25 plus cosine, and returns the top 5
   with the source string from the file's front matter. The corpus is small (tens of procedures),
   so this is numpy over a SQLite table. No vector database server.
3. The policy engine loads the same table to know step order, so there is one source of truth.

## Models (all local, pulled once at kickoff while wifi works)

| Need | Model | Size | Why |
| --- | --- | --- | --- |
| Embeddings | `BAAI/bge-small-en-v1.5` via sentence-transformers | 130 MB | Fast on CPU, good on short technical text |
| Keyword | `rank_bm25` | tiny | Exact matches on alarm names beat embeddings |
| LLM rewrite (optional) | `qwen2.5:3b` or `llama3.2:3b` via Ollama | 2 GB | Only rephrases the top step; retrieval-only if slow |
| Speech-to-text | `faster-whisper` small | 500 MB | Push-to-talk on the UI side, CPU is fine |

## Storage

| Store | Where | Why |
| --- | --- | --- |
| Step index | `data/index.sqlite` | One file, rebuilt from the corpus, no server |
| Audit log | `../audit/log.jsonl` | Append-only hash chain, human readable, easy to tamper for the demo |
| Operator roster | `trust/roster.json` | Public keys by operator id |

## Why not Cloudflare

Use case 21 requires 100% offline edge deployment with zero cloud connectivity, and the judges score
Speed to Fleet on DDIL operation. Workers, D1, Vectorize, and Workers AI all need a network path, so
none of them can be in the demo. A Cloudflare Pages site is fine for a public pitch page after the event.
