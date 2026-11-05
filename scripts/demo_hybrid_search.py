"""Display a readable demo of the combined keyword and semantic search.

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

from retrieval.key_value_search import search_key_values  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Demo hybrid search over the key-value database and Chroma semantic store."
    )
    parser.add_argument(
        "query",
        nargs="?",
        default="zoom",
        help="Search query (default: zoom).",
    )
    parser.add_argument(
        "--limit",
        "-n",
        type=int,
        default=3,
        help="Final top K matches after hybrid search and DeBERTa reranking (default: 3).",
    )
    parser.add_argument(
        "--candidate-limit",
        type=int,
        default=50,
        help="Candidates gathered from each method before reranking (default: 50).",
    )
    args = parser.parse_args()

    try:
        matches = search_key_values(
            args.query, limit=args.limit, candidate_limit=args.candidate_limit, mode="hybrid"
        )
    except (OSError, RuntimeError, ValueError) as exc:
        parser.error(str(exc))

    semantic_count = sum(match["match_type"] == "semantic" for match in matches)
    keyword_count = sum(match["match_type"] == "keyword" for match in matches)
    print(f'Hybrid search for: "{args.query}"')
    print(f"Results: {len(matches)} reranked matches ({semantic_count} semantic, {keyword_count} keyword-only)")
    print("DeBERTa scores scenario/action relevance; duplicate page IDs keep the semantic candidate.\n")

    if not matches:
        print("No matches found.")
        return 0

    for index, match in enumerate(matches, start=1):
        print(f"{index}. [{match['match_type'].upper()}] pageid={match['pageid']}")
        print(f"   Title: {match['title']}")
        if "rerank_score" in match:
            print(f"   DeBERTa relevance: {match['rerank_score']:.4f}")
        score_key = "distance" if match["match_type"] == "semantic" else "hit_count"
        print(f"   {score_key}: {match[score_key]}")
        print(f"   Result: {match['result'].replace(chr(10), ' ')[:240]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
