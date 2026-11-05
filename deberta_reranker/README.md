# DeBERTa scenario/action reranker

This fine-tuned `microsoft/deberta-v3-base` sequence classifier reranks the
WikiHow key/value hybrid search candidates. Training pairs use a scenario as
the query and the matching action list as the passage. Runtime passes the
user's query against each candidate title/scenario and action text, retains
the candidate `pageid`, and returns the top K with a `rerank_score`.

The saved root model is the best checkpoint (`checkpoint-1096`, validation
MRR@10 0.9833). Model loading is local-only. Install optional runtime packages
with `python -m pip install -r api/requirements-reranker.txt`; no download is
attempted during inference. The `checkpoint-*` directories and model weights
are local artifacts and are ignored by Git.

Example from the repository root:

```bash
./.venv/bin/python scripts/demo_hybrid_search.py "open XML" --candidate-limit 50 --limit 5
```

This model is trained on WikiHow data and is kept separate from the EOCC
procedure search, action policy, and audit path.

The retrieval pipeline exposes `rerank_score` as a Platt-scaled relevance
probability and `rerank_logit` as the positive-minus-negative class logit margin.
The pipeline uses `relevance_threshold` from `api/retrieval/pipeline.yaml` to
filter weak candidates before returning evidence; its current value is 0.5.
Hybrid candidates are selected with reciprocal-rank fusion across keyword and
semantic search, then final ordering blends the hybrid and reranker reciprocal
ranks using configured weights (currently 0.5 / 0.5).
Recreate the calibration parameters from the grouped validation pairs with:

```bash
./.venv/bin/python scripts/calibrate_reranker.py
```

This writes `calibration.json` beside the local model files. The script fits
on 80% of validation query groups and reports Brier score on the remaining
groups; both groups remain separate by query to avoid near-duplicate leakage.
