"""Puts api/ on the import path and points the audit log and keys at a temp folder."""
import os
import sys
import tempfile
from pathlib import Path

API = Path(__file__).resolve().parent.parent / "api"
sys.path.insert(0, str(API))

_tmp = Path(tempfile.mkdtemp(prefix="wsc-test-"))
os.environ.setdefault("WSC_AUDIT_PATH", str(_tmp / "log.jsonl"))
os.environ.setdefault("WSC_DATA_DIR", str(_tmp / "data"))
os.environ.setdefault("WSC_MODEL_DIR", str(API / "models"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
# The CASREP Board pull is a background thread; tests drive known.sync() themselves, with no network.
os.environ.setdefault("WSC_CASREP_SYNC", "0")
# The doctrine tests below are about the ddg casualty procedures, whatever the preset's default dataset is.
# tests/test_dataset_wikihow.py runs only when WSC_DATASET=wikihow.
os.environ.setdefault("WSC_DATASET", "ddg")

# Embedding a large dataset takes minutes. Reuse the real index when one exists; ensure_index()
# checks its corpus hash and rebuilds a stale copy, so this only skips work, never a check.
_name = os.environ["WSC_DATASET"]
_real = API / "data" / f"index-{_name}.sqlite"
_copy = Path(os.environ["WSC_DATA_DIR"]) / _real.name
if _real.exists() and not _copy.exists():
    import shutil
    _copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(_real, _copy)
