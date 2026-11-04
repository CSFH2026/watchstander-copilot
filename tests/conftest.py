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
