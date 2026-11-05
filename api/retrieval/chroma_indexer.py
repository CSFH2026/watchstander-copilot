"""Build a separate persistent Chroma vector store from the title/result dataset."""

from __future__ import annotations

from pathlib import Path

from retrieval.key_value_search import DEFAULT_DATASET_PATH, _read_rows


REPO_ROOT = Path(__file__).resolve().parents[2]
DATASETS_DIR = REPO_ROOT / "datasets"
DEFAULT_CHROMA_PATH = DATASETS_DIR / "wikihow_chroma_pageid"
COLLECTION_NAME = "wikihow_title_results"


def vectorize_dataset_to_chroma(
    dataset_path: str | Path = DEFAULT_DATASET_PATH,
    persist_directory: str | Path = DEFAULT_CHROMA_PATH,
    batch_size: int = 100,
) -> dict[str, str | int]:
    """Embed title/result rows with Chroma's default encoder into a new local store.

    The source spreadsheet is read only. The destination must not already exist,
    so this function never overwrites or updates an existing Chroma database.
    Chroma embeds each document automatically when ``collection.add`` is called.

    Returns the resolved Chroma directory, collection name, and indexed row count.
    """
    if batch_size <= 0:
        raise ValueError("batch_size must be greater than zero")

    source = Path(dataset_path).resolve()
    destination = Path(persist_directory).resolve()
    if destination.parent != DATASETS_DIR.resolve():
        raise ValueError(f"Chroma databases must be created directly in {DATASETS_DIR}")
    if destination.exists():
        raise FileExistsError(
            f"Chroma destination already exists; choose a new path: {destination}"
        )
    if destination == source:
        raise ValueError("Chroma destination cannot be the source dataset file")

    source_rows = _read_rows(source)
    if not source_rows:
        raise ValueError(f"No title/result rows found in dataset: {source}")

    rows = []
    seen_pageids: set[str] = set()
    duplicates_skipped = 0
    for row in source_rows:
        pageid = row["pageid"].strip()
        if not pageid:
            raise ValueError(f"Dataset row is missing a pageid: {row['title']}")
        if pageid in seen_pageids:
            duplicates_skipped += 1
            continue
        seen_pageids.add(pageid)
        rows.append({**row, "pageid": pageid})

    try:
        import chromadb
    except ImportError as exc:
        raise RuntimeError(
            "ChromaDB is required; install project dependencies with "
            "`python3 -m pip install -r api/requirements.txt`."
        ) from exc

    destination.parent.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(destination))
    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"source_dataset": source.name},
        # Deliberately omit embedding_function to use Chroma's default encoder.
    )

    for start in range(0, len(rows), batch_size):
        batch = rows[start:start + batch_size]
        documents = [f"Title: {row['title']}\nResult: {row['result']}" for row in batch]
        collection.add(
            ids=[row["pageid"] for row in batch],
            documents=documents,
            metadatas=[{"pageid": row["pageid"], "title": row["title"]} for row in batch],
        )

    return {
        "persist_directory": str(destination),
        "collection": COLLECTION_NAME,
        "rows_indexed": len(rows),
        "duplicates_skipped": duplicates_skipped,
    }
