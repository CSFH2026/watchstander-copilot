# Retrieval engine

It has two halves that share one file, `api/data/index.sqlite`.
The index half runs once per corpus change (`make index`).
The query half runs on every `/query` and must answer in under 5 s with wifi off.

## Index time: `make index`

| # | Step | What it does | File | Library or model | Issue |
| --- | --- | --- | --- | --- | --- |
| 1 | Load | Read every `corpus/<ship_class>/*.md` file | `indexer.py` | `pathlib`, `pyyaml` | #3 |
| 2 | Parse | Split front matter (title, source, symptoms, causes) from the numbered step lines; pull `step_id`, text, `requires:`, `danger:` from each line | `parse.py` | `re` | #3 |
| 3 | Expand | Rewrite shorthand to full words (LO to lube oil, SSGTG to ship service gas turbine generator) | `normalize.py` | `abbreviations.yaml` | #3 |
| 4 | Search text | Build one string per step: procedure title + symptoms + causes + step text | `indexer.py` | none | #3 |
| 5 | Embed | Turn each search text into a 384-number vector, normalized to length 1 | `embed.py` | `fastembed`, `BAAI/bge-small-en-v1.5` | #3 |
| 6 | Write | Write procedures, steps, vectors, and graph edges to SQLite, plus the model name and a corpus hash | `indexer.py` | `sqlite3`, `numpy` | #3 |

## Query time: `POST /query`

| # | Step | What it does | File | Library or model | Budget | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Speech to text | Voice only: the UI posts audio to `/transcribe` | `../speech.py` | `faster-whisper`, `base.en` | about 1 s | #21 |
| 2 | Normalize | Lowercase, expand shorthand with the same list as index step 3 | `normalize.py` | `abbreviations.yaml` | under 1 ms | #4 |
| 3 | Keyword score | BM25 over every step's search text, built in memory at startup | `search.py` | `rank_bm25` | under 10 ms | #4 |
| 4 | Semantic score | Embed the query with the bge query prefix, dot product against the vector matrix | `search.py` | `bge-small-en-v1.5`, `numpy` | about 5 ms | #4 |
| 5 | Fuse | Merge the two ranked lists with reciprocal rank fusion: score = sum of 1 / (60 + rank) | `fuse.py` | none | under 1 ms | #4 |
| 6 | Group and cite | Rank procedures by their best step, return the top procedure's steps in `requires:` order, then the runner-up's first step, 5 rows in all, each with its `source` | `search.py` | `edges` table | under 5 ms | #4 |
| 7 | Rewrite, optional | Rephrase the top step in plain words; skipped past 2 s | `rewrite.py` | Ollama, `qwen2.5:3b` | 0 to 2 s | #7 |
| 8 | Time and hand off | Stamp `latency_ms`, pass the result to the trust layer to sign | `../main.py` | none | under 1 ms | #5 |

The separate WikiHow key/value pipeline in `pipeline.py` accepts a prompt, fuses the semantic and keyword lists by reciprocal rank before limiting the candidate pool, and reranks each candidate's title and exact action value against the prompt with the fine-tuned DeBERTa model. The final order blends hybrid and reranker reciprocal ranks equally (0.5 each). It returns candidate ID, name, exact value, a Platt-calibrated `rerank_score` probability, raw logit margin, and both ranks. Other defaults are `candidate_limit: 50`, `evidence_limit: 5`, and `relevance_threshold: 0.5`; settings can be overridden in `run_hybrid_rerank_pipeline`. Candidates below the calibrated-probability threshold are omitted. Fit calibration parameters from the held-out validation pairs with `.venv/bin/python scripts/calibrate_reranker.py`. Run the CLI with `.venv/bin/python scripts/demo_hybrid_search.py "your prompt"`. Install `api/requirements-reranker.txt` to use the model. This checkpoint was trained on WikiHow scenario/action pairs; the EOCC procedure retrieval and its policy path do not use it.

## Index schema: `api/data/index.sqlite`

```sql
CREATE TABLE procedures (procedure_id TEXT PRIMARY KEY, ship_class TEXT, title TEXT, source TEXT,
                         symptoms TEXT, causes TEXT, file TEXT);           -- symptoms, causes as JSON arrays
CREATE TABLE steps      (step_id TEXT PRIMARY KEY, procedure_id TEXT, seq INTEGER, text TEXT,
                         danger TEXT, search_text TEXT, embedding BLOB);   -- float32, 384 values
CREATE TABLE edges      (src TEXT, dst TEXT, kind TEXT);                   -- kind: requires, associated
CREATE TABLE meta       (key TEXT PRIMARY KEY, value TEXT);                -- model, dim, corpus_sha256, built_at
```

The `edges` table is the knowledge graph.
`requires` edges come from each step line and drive the policy engine.
`associated` edges come from an optional `associated:` list in a procedure's front matter, taken from the "associated casualties" column of the MSC cards, and drive the "watch for next" list in the UI.

## Where everything is

| Thing | Where | Size | How to get it offline |
| --- | --- | --- | --- |
| DDG procedures | `corpus/ddg/`, generated from `corpus/ddg/src/` by `scripts/build_ddg.py` | 102 files | In the repo |
| Source documents | `docs/data-sources.md` lists 20 public sources | about 270 MB of originals | USB copy, not in the repo |
| Abbreviation map | `corpus/<dataset>/abbreviations.yaml` | 1 file | In the repo |
| Plant term list | `corpus/terms/plant_terms.txt`, 143 terms | 1 file | In the repo |
| Voice test lines | `tests/voice/test_utterances.txt`, 20 lines | 1 file | In the repo |
| Embedding model | `BAAI/bge-small-en-v1.5`, quantized ONNX via fastembed | 64 MB | `make setup`, cached in `api/models/` |
| Speech model | `Systran/faster-whisper-base.en` | 145 MB | `make setup`; `small.en` (484 MB) only on a fast laptop |
| Rewrite model, optional | `qwen2.5:3b` via Ollama | about 2 GB | `ollama pull qwen2.5:3b` |
| Reranker, WikiHow hybrid demo | Fine-tuned local DeBERTa checkpoint | about 704 MB weights | `deberta_reranker/`; install `api/requirements-reranker.txt` |

Copy `api/models/` and `~/.ollama/models` to the USB stick at kickoff.

## Done when

- `make index DATASET=ddg` prints 102 procedures, 771 steps, and the edge count.
- `scripts/eval_ddg.py` reports the hit rate of the 204 watchstander questions in `tests/fixtures/ddg_symptom_queries.yaml`; `tests/test_dataset_ddg.py` holds the same set as tests.
- Ten queries in a row stay under 5 s with wifi off.
