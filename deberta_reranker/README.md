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
