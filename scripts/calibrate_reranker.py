"""Fit Platt scaling for the DeBERTa reranker using grouped validation pairs.

Run from the repository root after installing api/requirements-reranker.txt:
    .venv/bin/python scripts/calibrate_reranker.py
"""

from __future__ import annotations

import json
import hashlib
import math
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import torch

from retrieval.key_value_search import DEFAULT_DATASET_PATH, _read_rows
from retrieval.rerank import DebertaReranker

SPLIT_PATH = REPO_ROOT / "deberta_reranker" / "dataset_splits" / "validation.jsonl"
MODEL_PATH = REPO_ROOT / "deberta_reranker"
OUTPUT_PATH = MODEL_PATH / "calibration.json"


def _fit_platt(margins: list[float], labels: list[int]) -> tuple[float, float]:
    x = torch.tensor(margins, dtype=torch.float64)
    y = torch.tensor(labels, dtype=torch.float64)
    params = torch.nn.Parameter(torch.tensor([1.0, 0.0], dtype=torch.float64))
    optimizer = torch.optim.LBFGS([params], lr=0.1, max_iter=200, line_search_fn="strong_wolfe")

    def closure():
        optimizer.zero_grad()
        loss = torch.nn.functional.binary_cross_entropy_with_logits(params[0] * x + params[1], y)
        loss.backward()
        return loss

    optimizer.step(closure)
    slope, intercept = (float(v) for v in params.detach().tolist())
    if slope <= 0:
        raise RuntimeError(f"Calibration slope is {slope:.6f}; check labels and validation pairs")
    return slope, intercept


def _sigmoid(value: float) -> float:
    value = max(-60.0, min(60.0, value))
    return 1.0 / (1.0 + math.exp(-value))


def main() -> int:
    source_rows = _read_rows(DEFAULT_DATASET_PATH)
    titles_by_value: dict[str, list[str]] = defaultdict(list)
    for row in source_rows:
        titles_by_value[row["result"]].append(row["title"])

    rows = [
        json.loads(line)
        for line in SPLIT_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    examples = []
    for row in rows:
        titles = titles_by_value.get(row["passage"])
        if not titles:
            continue
        title = row["query"] if row["query"] in titles else titles[0]
        passage = f"Scenario: {title}\nActions: {row['passage']}"
        examples.append((row["query_id"], row["query"], passage, int(row["label"])))
    if not examples:
        raise RuntimeError(f"No validation passages matched {DEFAULT_DATASET_PATH}")

    query_ids = sorted({example[0] for example in examples})
    eval_ids = {
        query_id for query_id in query_ids
        if int(hashlib.sha256(query_id.encode()).hexdigest()[:8], 16) % 5 == 0
    }
    if not eval_ids or len(eval_ids) == len(query_ids):
        raise RuntimeError("Could not form a grouped calibration/evaluation split")
    fit_ids = set(query_ids) - eval_ids
    fit_examples = [e for e in examples if e[0] in fit_ids]
    eval_examples = [e for e in examples if e[0] not in fit_ids]

    reranker = DebertaReranker(MODEL_PATH)
    all_pairs = [(e[1], e[2]) for e in examples]
    logits = reranker.raw_logits(all_pairs)
    margins = [positive - negative for negative, positive in logits]
    fit_indexes = [i for i, e in enumerate(examples) if e[0] in fit_ids]
    eval_indexes = [i for i, e in enumerate(examples) if e[0] not in fit_ids]
    slope, intercept = _fit_platt(
        [margins[i] for i in fit_indexes],
        [examples[i][3] for i in fit_indexes],
    )
    eval_probabilities = [_sigmoid(slope * margins[i] + intercept) for i in eval_indexes]
    eval_labels = [examples[i][3] for i in eval_indexes]
    brier = sum((p - y) ** 2 for p, y in zip(eval_probabilities, eval_labels)) / len(eval_labels)

    calibration = {
        "method": "platt_scaling",
        "model": "deberta_reranker",
        "margin": "positive_class_logit_minus_negative_class_logit",
        "slope": slope,
        "intercept": intercept,
        "positive_label": 1,
        "source": "dataset_splits/validation.jsonl, matched to local title/action records",
        "fit_query_groups": len(fit_ids),
        "fit_pairs": len(fit_examples),
        "evaluation_query_groups": len(eval_ids),
        "evaluation_pairs": len(eval_examples),
        "evaluation_brier_score": brier,
    }
    OUTPUT_PATH.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {OUTPUT_PATH}")
    print(f"Platt slope={slope:.6f}, intercept={intercept:.6f}")
    print(f"Fit pairs={len(fit_examples)}; held-out pairs={len(eval_examples)}; held-out Brier={brier:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
