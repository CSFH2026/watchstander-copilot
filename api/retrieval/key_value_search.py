"""Search the WikiHow title/result dataset using title keyword matches."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path


DEFAULT_DATASET_PATH = Path(__file__).resolve().parents[2] / "datasets" / "wikihow_lists_cleaned.xls"
SS_NS = "urn:schemas-microsoft-com:office:spreadsheet"
NS = {"ss": SS_NS}


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
) -> list[dict[str, str | int]]:
    """Return the top title/result matches, ranked by keyword hits in each title.

    ``keys`` may be a query string or a list of keywords. A hit is a query keyword
    found in the title (case-insensitive, whole word); repeated occurrences count
    as additional hits. ``limit`` controls the maximum number of rows returned.
    Results include ``hit_count`` and ties retain the dataset's original order.
    """
    if limit < 0:
        raise ValueError("limit must be non-negative")
    query_terms = re.findall(r"\w+", keys) if isinstance(keys, str) else [
        term for key in keys for term in re.findall(r"\w+", key)
    ]
    if not query_terms or limit == 0:
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
