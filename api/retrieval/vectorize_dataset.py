"""Build a new Chroma vector store from the repository's current dataset.

Run from the repository root with:
    python3 api/retrieval/vectorize_dataset.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from retrieval.chroma_indexer import (  # noqa: E402
    DEFAULT_CHROMA_PATH,
    DEFAULT_DATASET_PATH,
    vectorize_dataset_to_chroma,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a separate persistent ChromaDB in the repository's datasets folder."
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Source spreadsheet (defaults to the repo's current dataset).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_CHROMA_PATH,
        help="New persistence directory directly inside datasets/ (must not already exist).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Rows per Chroma insert batch (default: 100).",
    )
    args = parser.parse_args()

    try:
        summary = vectorize_dataset_to_chroma(
            dataset_path=args.dataset,
            persist_directory=args.output,
            batch_size=args.batch_size,
        )
    except (FileExistsError, FileNotFoundError, ValueError, RuntimeError) as exc:
        parser.error(str(exc))

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
