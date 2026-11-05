"""Hybrid search followed by local DeBERTa reranking for key/value evidence."""

from pathlib import Path
from typing import Any

import yaml

from retrieval.key_value_search import get_reranker, search_key_values

CONFIG_PATH = Path(__file__).with_name("pipeline.yaml")


def load_pipeline_config(path: Path = CONFIG_PATH) -> dict[str, int | float]:
    """Load and validate pipeline limits, cutoff, and rank-fusion weights."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    values = {}
    for key in ("candidate_limit", "evidence_limit"):
        value = raw.get(key)
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"{path}: {key} must be a positive integer")
        values[key] = value
    threshold = raw.get("relevance_threshold")
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not 0 <= threshold <= 1:
        raise ValueError(f"{path}: relevance_threshold must be a number between 0 and 1")
    values["relevance_threshold"] = float(threshold)
    for key in ("hybrid_weight", "rerank_weight"):
        weight = raw.get(key)
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not 0 <= weight <= 1:
            raise ValueError(f"{path}: {key} must be a number between 0 and 1")
        values[key] = float(weight)
    if abs(float(values["hybrid_weight"]) + float(values["rerank_weight"]) - 1.0) > 1e-6:
        raise ValueError(f"{path}: hybrid_weight and rerank_weight must sum to 1")
    return values


def run_hybrid_rerank_pipeline(
    prompt: str,
    candidate_limit: int | None = None,
    evidence_limit: int | None = None,
    relevance_threshold: float | None = None,
    hybrid_weight: float | None = None,
    rerank_weight: float | None = None,
) -> list[dict[str, Any]]:
    """Retrieve hybrid candidates for ``prompt``, rerank their values, and return top evidence.

    The adjacent ``pipeline.yaml`` supplies defaults. Candidates below the
    calibrated relevance threshold are omitted. Each returned item preserves the
    source page ID, candidate name, exact value, calibrated probability, and raw
    logit margin. Reranking compares the prompt with the candidate title and
    action value, matching the scenario/action format used to train the model.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")
    settings = load_pipeline_config()
    candidate_limit = settings["candidate_limit"] if candidate_limit is None else candidate_limit
    evidence_limit = settings["evidence_limit"] if evidence_limit is None else evidence_limit
    relevance_threshold = (
        float(settings["relevance_threshold"])
        if relevance_threshold is None else relevance_threshold
    )
    hybrid_weight = float(settings["hybrid_weight"]) if hybrid_weight is None else hybrid_weight
    rerank_weight = float(settings["rerank_weight"]) if rerank_weight is None else rerank_weight
    for name, value in (("candidate_limit", candidate_limit), ("evidence_limit", evidence_limit)):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"{name} must be a positive integer")
    if (isinstance(relevance_threshold, bool)
            or not isinstance(relevance_threshold, (int, float))
            or not 0 <= relevance_threshold <= 1):
        raise ValueError("relevance_threshold must be a number between 0 and 1")
    for name, value in (("hybrid_weight", hybrid_weight), ("rerank_weight", rerank_weight)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
            raise ValueError(f"{name} must be a number between 0 and 1")
    if abs(hybrid_weight + rerank_weight - 1.0) > 1e-6:
        raise ValueError("hybrid_weight and rerank_weight must sum to 1")

    # search_key_values gathers up to candidate_limit from each source. Its
    # non-reranked hybrid output is capped here to the configured total shortlist.
    candidates = search_key_values(
        prompt,
        limit=candidate_limit,
        candidate_limit=candidate_limit,
        mode="hybrid",
        rerank=False,
    )[:candidate_limit]
    if not candidates:
        return []

    # Training examples pair a scenario with actions; include both candidate title
    # and action value to preserve that learned input format.
    score_details = get_reranker().score_details([
        (prompt, f"Scenario: {candidate['title']}\nActions: {candidate['result']}")
        for candidate in candidates
    ])
    rerank_order = sorted(
        range(len(candidates)),
        key=lambda i: (-score_details[i][1], str(candidates[i]["pageid"])),
    )
    rerank_rank = {candidate_index: rank for rank, candidate_index in enumerate(rerank_order)}
    blended = []
    for hybrid_rank, (candidate, (logit, probability)) in enumerate(zip(candidates, score_details)):
        model_rank = rerank_rank[hybrid_rank]
        hybrid_rrf = 1.0 / (60 + hybrid_rank + 1)
        model_rrf = 1.0 / (60 + model_rank + 1)
        blend_score = hybrid_weight * hybrid_rrf + rerank_weight * model_rrf
        if probability >= relevance_threshold:
            blended.append((candidate, logit, probability, hybrid_rank, model_rank, blend_score))
    reranked = sorted(blended, key=lambda item: (-item[5], -item[2], str(item[0]["pageid"])))[:evidence_limit]
    return [
        {
            "candidate_id": str(candidate["pageid"]),
            "candidate_name": str(candidate["title"]),
            "candidate_value": str(candidate["result"]),
            "rerank_logit": float(logit),
            "rerank_score": float(probability),
            "hybrid_rank": hybrid_rank + 1,
            "rerank_rank": model_rank + 1,
            "blend_score": float(blend_score),
        }
        for candidate, logit, probability, hybrid_rank, model_rank, blend_score in reranked
    ]
