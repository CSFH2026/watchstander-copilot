"""Display the top evidence from hybrid search and DeBERTa reranking.

Run from the repository root:
    .venv/bin/python scripts/demo_hybrid_search.py zoom --limit 3
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from retrieval.pipeline import run_hybrid_rerank_pipeline  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Hybrid-search a prompt, rerank candidate values, and display top evidence."
    )
    parser.add_argument(
        "query",
        nargs="?",
        default="zoom",
        help="Search query (default: zoom).",
    )
    parser.add_argument(
        "--evidence-limit",
        "--limit",
        "-n",
        type=int,
        default=None,
        help="Final reranked evidence count (default from api/retrieval/pipeline.yaml: 5).",
    )
    parser.add_argument(
        "--candidate-limit",
        type=int,
        default=None,
        help="Hybrid candidate shortlist size (default from api/retrieval/pipeline.yaml: 50).",
    )
    parser.add_argument(
        "--relevance-threshold",
        type=float,
        default=None,
        help="Minimum calibrated probability to return (default from pipeline.yaml: 0.5).",
    )
    args = parser.parse_args()

    try:
        matches = run_hybrid_rerank_pipeline(
            args.query,
            candidate_limit=args.candidate_limit,
            evidence_limit=args.evidence_limit,
            relevance_threshold=args.relevance_threshold,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        parser.error(str(exc))

    print(f'Hybrid search for: "{args.query}"')
    print(f"Top evidence: {len(matches)} reranked candidates\n")

    if not matches:
        print("No matches found.")
        return 0

    for index, match in enumerate(matches, start=1):
        print(
            f"{index}. pageid={match['candidate_id']}  "
            f"blend={match['blend_score']:.5f}  "
            f"P(relevant)={match['rerank_score']:.4f}  "
            f"logit_margin={match['rerank_logit']:.4f}  "
            f"hybrid_rank={match['hybrid_rank']}  rerank_rank={match['rerank_rank']}"
        )
        print(f"   Candidate name: {match['candidate_name']}")
        print(f"   Candidate value: {match['candidate_value'].replace(chr(10), ' ')[:240]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
