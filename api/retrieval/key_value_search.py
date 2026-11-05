"""Search the WikiHow title/result dataset by keywords or semantic similarity."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path


DEFAULT_DATASET_PATH = Path(__file__).resolve().parents[2] / "databases" / "wikihow_lists_cleaned.xls"
DEFAULT_CHROMA_PATH = Path(__file__).resolve().parents[2] / "databases" / "wikihow_chroma_pageid"
COLLECTION_NAME = "wikihow_title_results"
RERANKER_PATH = Path(__file__).resolve().parents[2] / "deberta_reranker"
SS_NS = "urn:schemas-microsoft-com:office:spreadsheet"
NS = {"ss": SS_NS}


@lru_cache(maxsize=1)
def _reranker():
    # Import model support lazily so keyword-only search does not load torch.
    from retrieval.rerank import DebertaReranker

    return DebertaReranker(RERANKER_PATH)


def _read_rows(dataset_path: Path) -> list[dict[str, str]]:
    """Read title/result rows from the Excel SpreadsheetML file in the repo."""
    root = ET.parse(dataset_path).getroot()
    worksheet = root.find("ss:Worksheet", NS)
    if worksheet is None:
        raise ValueError(f"No worksheet found in dataset: {dataset_path}")
    table = worksheet.find("ss:Table", NS)
    if table is None:
        raise ValueError(f"No table found in dataset: {dataset_path}")

    rows = []
    headers: list[str] = []
    for row in table.findall("ss:Row", NS):
        values = []
        for cell in row.findall("ss:Cell", NS):
            data = cell.find("ss:Data", NS)
            values.append("".join(data.itertext()).strip() if data is not None else "")
        if not headers:
            headers = values
            continue
        record = dict(zip(headers, values))
        if record.get("title") and record.get("result"):
            rows.append({
                "pageid": record.get("pageid", ""),
                "title": record["title"],
                "result": record["result"],
            })
    return rows


def search_key_values(
    keys: str | list[str],
    limit: int = 5,
    dataset_path: str | Path = DEFAULT_DATASET_PATH,
    mode: str = "hybrid",
    chroma_path: str | Path = DEFAULT_CHROMA_PATH,
    candidate_limit: int = 50,
    rerank: bool = True,
) -> list[dict[str, str | int | float]]:
    """Search title/result pairs and optionally rerank hybrid candidates locally.

    ``keys`` is a search string or list of terms. ``mode="keyword"`` matches whole
    words in titles and ranks by occurrences. ``mode="semantic"`` queries the
    persistent Chroma collection. Hybrid mode gathers up to ``candidate_limit``
    semantic and keyword candidates, deduplicates by page ID, then uses the local
    DeBERTa scenario/action model to return the best ``limit`` matches. Set
    ``rerank=False`` to retain the original semantic-first ordering. Every record
    includes ``pageid``, ``title``, ``result``, and ``match_type``; the reranked
    hybrid results also include ``rerank_score``.
    """
    if limit < 0:
        raise ValueError("limit must be non-negative")
    if candidate_limit < 0:
        raise ValueError("candidate_limit must be non-negative")
    if mode not in {"keyword", "semantic", "hybrid"}:
        raise ValueError("mode must be 'keyword', 'semantic', or 'hybrid'")
    query = keys if isinstance(keys, str) else " ".join(keys)
    if not query.strip() or limit == 0:
        return []

    if mode == "semantic":
        return [
            {**record, "match_type": "semantic"}
            for record in _semantic_search(query, limit, Path(chroma_path))
        ]

    keyword_results = _keyword_search(keys, candidate_limit if mode == "hybrid" else limit, Path(dataset_path))
    if mode == "keyword":
        return [{**record, "match_type": "keyword"} for record in keyword_results]

    semantic_results = _semantic_search(query, candidate_limit, Path(chroma_path))
    combined = []
    seen_pageids = set()
    for record in semantic_results:
        pageid = str(record["pageid"])
        if pageid not in seen_pageids:
            combined.append({**record, "match_type": "semantic"})
            seen_pageids.add(pageid)
    for record in keyword_results:
        pageid = str(record["pageid"])
        if pageid not in seen_pageids:
            combined.append({**record, "match_type": "keyword"})
            seen_pageids.add(pageid)
    if not rerank or not combined:
        return combined[:limit]

    pairs = [
        (query, f"Scenario: {record['title']}\nActions: {record['result']}")
        for record in combined
    ]
    scores = _reranker().score(pairs)
    ordered = sorted(
        zip(combined, scores),
        key=lambda item: (-item[1], str(item[0]["pageid"])),
    )
    return [{**record, "rerank_score": float(score)} for record, score in ordered[:limit]]


def _keyword_search(
    keys: str | list[str], limit: int, dataset_path: Path
) -> list[dict[str, str | int | float]]:
    query_terms = re.findall(r"\w+", keys) if isinstance(keys, str) else [
        term for key in keys for term in re.findall(r"\w+", key)
    ]
    if not query_terms:
        return []

    ranked = []
    for position, record in enumerate(_read_rows(Path(dataset_path))):
        title = record["title"]
        title_terms = re.findall(r"\w+", title.casefold())
        counts = {term.casefold(): title_terms.count(term.casefold()) for term in query_terms}
        hit_count = sum(counts.values())
        if hit_count:
            ranked.append({
                "pageid": record["pageid"],
                "title": title,
                "result": record["result"],
                "hit_count": hit_count,
                "_position": position,
            })

    ranked.sort(key=lambda item: (-int(item["hit_count"]), int(item["_position"])))
    return [{key: value for key, value in item.items() if key != "_position"}
            for item in ranked[:limit]]


def _semantic_search(
    query: str, limit: int, chroma_path: Path
) -> list[dict[str, str | int | float]]:
    """Query Chroma and map stored title/result documents to the search result shape."""
    if not chroma_path.exists():
        raise FileNotFoundError(
            f"Chroma database not found at {chroma_path}; run "
            "api/retrieval/vectorize_dataset.py first."
        )
    try:
        import chromadb
    except ImportError as exc:
        raise RuntimeError("Semantic search requires ChromaDB; install api/requirements.txt.") from exc

    client = chromadb.PersistentClient(path=str(chroma_path))
    collection = client.get_collection(COLLECTION_NAME)
    collection_size = collection.count()
    if collection_size == 0:
        return []
    result_set = collection.query(
        query_texts=[query],
        n_results=min(limit, collection_size),
        include=["documents", "metadatas", "distances"],
    )

    matches = []
    ids = result_set["ids"][0]
    documents = result_set["documents"][0]
    metadatas = result_set["metadatas"][0]
    distances = result_set["distances"][0]
    for pageid, document, metadata, distance in zip(ids, documents, metadatas, distances):
        if not document:
            continue
        title = metadata.get("title", "")
        _, separator, result = document.partition("\nResult: ")
        if not separator:
            continue
        matches.append({
            "pageid": str(metadata.get("pageid") or pageid),
            "title": title,
            "result": result,
            "distance": float(distance),
        })
    return matches
