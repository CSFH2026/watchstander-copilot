"""Paths and names shared by every backend module. Env vars exist so tests can point at a temp folder."""
import os
from pathlib import Path

API_DIR = Path(__file__).resolve().parent
REPO_ROOT = API_DIR.parent

CORPUS_DIR = Path(os.environ.get("WSC_CORPUS_DIR", REPO_ROOT / "corpus"))
DATA_DIR = Path(os.environ.get("WSC_DATA_DIR", API_DIR / "data"))
MODEL_DIR = Path(os.environ.get("WSC_MODEL_DIR", API_DIR / "models"))
AUDIT_PATH = Path(os.environ.get("WSC_AUDIT_PATH", REPO_ROOT / "audit" / "log.jsonl"))
UI_DIR = REPO_ROOT / "ui" / "out"

INDEX_PATH = DATA_DIR / "index.sqlite"
KEYS_DIR = DATA_DIR / "keys"
ROSTER_PATH = DATA_DIR / "roster.json"
ABBREVIATIONS_PATH = API_DIR / "retrieval" / "abbreviations.yaml"

EMBED_MODEL = "BAAI/bge-small-en-v1.5"
NODE_ID = "copilot-node-01"
# Demo operators. In production each key is bound to the Sailor's CAC at enrollment.
OPERATOR_IDS = ["EOOW-01", "EOOW-02"]
