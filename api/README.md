# Backend

FastAPI app. Everything runs on the demo laptop with wifi off. Nothing calls out.

## Layout

| Path | What |
| --- | --- |
| `main.py` | FastAPI app: `/api/query`, `/api/action`, `/api/reset`, `/api/demo/key-value/search`, `/api/demo/key-value/answer`, `/api/audit`, `/api/audit/verify`, and the built UI at `/` |
| `config.py` | Every path and name in one place; `WSC_*` env vars override them for tests |
| `retrieval/` | Index and search. Step-by-step breakdown in `retrieval/README.md` |
| `retrieval/search.py` | Hybrid search: BM25 keyword score + embedding cosine, returns ranked cited steps |
| `retrieval/rewrite.py` | Optional local LLM rewrite of the top result, skipped when it exceeds 2 s |
| `policy/engine.py` | Per-procedure step state machine, `requires:` and `danger:` rules, reasons |
| `trust/keys.py` | Ed25519 keypair per operator in `data/keys/`, public keys in `data/roster.json`; `python -m trust.keys enroll EOOW-03` |
| `trust/sign.py` | Signs every response and action |
| `trust/audit.py` | Append-only hash chain in `../audit/log.jsonl` |
| `trust/verify.py` | `python -m trust.verify [log.jsonl]`; with no path it checks `WSC_AUDIT_PATH`, else `audit/log.jsonl` |
| `models/` | Downloaded model files, gitignored, pulled by `make setup` |
| `data/` | `index.sqlite`, rebuilt by `make index` |

## RAG pipeline

1. `make index` reads every corpus file, splits on step lines, and stores one row per step:
   `procedure_id`, `step_id`, `text`, `source`, `requires`, `danger`, `symptoms`, `embedding`.
2. `/query` embeds the symptom text, scores every step by BM25 plus cosine, and returns the top 5
   with the source string from the file's front matter. The corpus is small (tens of procedures),
   so this is numpy over a SQLite table. No vector database server.
3. The policy engine loads the same table to know step order, so there is one source of truth.

## WikiHow key/value demo

`POST /api/demo/key-value/search` runs `retrieval/pipeline.py` against the WikiHow sample dataset and local DeBERTa reranker. Send `{"prompt":"how to clean a zip drive"}`; `candidate_limit`, `evidence_limit`, and `relevance_threshold` are optional and default from `retrieval/pipeline.yaml`. The response contains ranked candidate ID/name/value records. Install `api/requirements-reranker.txt` and prepare the local Chroma index and reranker checkpoint as described in `retrieval/README.md`.

`POST /api/demo/key-value/answer` performs that same retrieval and reranking, then sends the prompt and ranked candidates to OpenAI for a grounded response. The `/search-demo/` page carries up to 12 prior turns as conversational context for follow-up questions; **Clear context** starts a new conversation. Provide `OPENAI_API_KEY` only to the backend (optionally set `OPENAI_MODEL`, default `gpt-6-astra`), then run `make dev`. The UI displays the answer and its candidate samples. If no current results or prior samples provide context, generation is skipped. The API request disables response storage. This optional online demo sends the prompt and retrieved samples externally; its unverified results are not authorized procedure guidance.

This is an unverified reference demo only. It is separate from `/api/query`, `/api/action`, and the EOCC policy engine; its samples are not authorized procedures or action guidance.

## Models (all local, pulled once at kickoff while wifi works)

| Need | Model | Size | Why |
| --- | --- |
| Embeddings | `BAAI/bge-small-en-v1.5`, quantized ONNX build via fastembed | 64 MB | No torch install; about 6 ms per query on CPU |
| Keyword | `rank_bm25` | tiny | Exact matches on alarm names beat embeddings |
| LLM rewrite (optional) | `qwen2.5:3b` or `llama3.2:3b` via Ollama | 2 GB | Only rephrases the top step; retrieval-only if slow |
| Speech-to-text | `faster-whisper` base.en | 145 MB | About 1 s per clip on CPU; small.en (484 MB) only on a fast laptop |

## Storage

| Store | Where | Why |
| --- | --- |
| Step index | `data/index.sqlite` | One file, rebuilt from the corpus, no server |
| Audit log | `../audit/log.jsonl` | Append-only hash chain, human readable, easy to tamper for the demo |
| Operator roster | `trust/roster.json` | Public keys by operator id |

## Why not Cloudflare

Use case 21 requires 100% offline edge deployment with zero cloud connectivity, and the judges score
Speed to Fleet on DDIL operation. Workers, D1, Vectorize, and Workers AI all need a network path, so
none of them can be in the demo. A Cloudflare Pages site is fine for a public pitch page after the event.
