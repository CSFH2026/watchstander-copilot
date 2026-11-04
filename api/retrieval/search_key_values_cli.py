"""Command-line interface for searching the title/result dataset.

Run from the repository root, for example:
    python3 api/retrieval/search_key_values_cli.py "garden plants" --limit 10
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Support direct execution from the repository root as well as `python -m` use.
API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from retrieval.key_value_search import DEFAULT_DATASET_PATH, search_key_values


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Search dataset titles and return the matching results, ranked by keyword hits."
    )
    parser.add_argument(
        "keys",
        nargs="+",
        help="Search terms (quote a multiword phrase to pass it as one argument).",
    )
    parser.add_argument(
        "--limit",
        "-n",
        type=int,
        default=5,
        help="Maximum number of matches to return (default: 5).",
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to the dataset file (defaults to datasets/wikihow_lists_cleaned.xls).",
    )
    args = parser.parse_args()

    try:
        matches = search_key_values(args.keys, limit=args.limit, dataset_path=args.dataset)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))

    print(json.dumps(matches, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
