"""Settings shared by every backend module, loaded from one hoster config file.

WSC_CONFIG picks the file (default config/local.yaml). The WSC_*_DIR env vars still override
paths so tests can point at a temp folder. load() is pure, so tests can check any file.
"""
import os
from pathlib import Path

import yaml

API_DIR = Path(__file__).resolve().parent
REPO_ROOT = API_DIR.parent

TARGETS = ("local", "cloudflare")
PROVIDERS_ALLOWED = ("local", "cloudflare", "off")
SLOTS = ("embed", "transcribe", "rewrite", "rerank")
# Slots whose providers are not written yet (issues 21 and 7). They must stay off until they are.
UNBUILT_SLOTS = ("transcribe", "rewrite", "rerank")
RETRIEVAL_DEFAULTS = {"rrf_k": 60, "ambiguous_ratio": 0.94, "min_cosine": 0.55, "min_cosine_without_keywords": 0.62}


class ConfigError(ValueError):
    pass


def load(path: Path) -> dict:
    """Reads and validates one config file. Every error names the file and the key to fix."""
    if not path.exists():
        raise ConfigError(f"{path}: config file not found. Pick one in config/ with WSC_CONFIG.")
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    target = raw.get("target")
    if target not in TARGETS:
        raise ConfigError(f"{path}: target must be one of {', '.join(TARGETS)}, found {target!r}")
    operators = raw.get("operators") or []
    if not operators or not all(isinstance(o, str) and o for o in operators):
        raise ConfigError(f"{path}: operators must be a list of operator ids")

    models = raw.get("models") or {}
    slots = {}
    for slot in SLOTS:
        entry = models.get(slot) or {"provider": "off"}
        provider = entry.get("provider", "off")
        # YAML 1.1 reads a bare off as false; a hoster should not have to know that.
        if provider is False:
            provider = "off"
        if provider not in PROVIDERS_ALLOWED:
            raise ConfigError(f"{path}: models.{slot}.provider must be one of {', '.join(PROVIDERS_ALLOWED)}, found {provider!r}")
        if provider != "off" and not entry.get("model"):
            raise ConfigError(f"{path}: models.{slot}.model is required when the provider is {provider}")
        if target == "cloudflare" and provider == "local":
            raise ConfigError(f"{path}: models.{slot} is local, but a cloudflare target cannot reach models on a laptop")
        if slot in UNBUILT_SLOTS and provider != "off":
            raise ConfigError(f"{path}: models.{slot} has no provider written yet; set it to off")
        slots[slot] = {"provider": provider, "model": entry.get("model") if provider != "off" else None}
    if slots["embed"]["provider"] == "off":
        raise ConfigError(f"{path}: models.embed cannot be off; retrieval needs embeddings")

    retrieval = dict(RETRIEVAL_DEFAULTS)
    for key, value in (raw.get("retrieval") or {}).items():
        if key not in RETRIEVAL_DEFAULTS:
            raise ConfigError(f"{path}: retrieval.{key} is not a known setting")
        retrieval[key] = type(RETRIEVAL_DEFAULTS[key])(value)

    local = {"host": "127.0.0.1", "port": 8000, "ollama_url": "http://127.0.0.1:11434"} | (raw.get("local") or {})
    cloudflare = {"account_id": "", "pages_project": "", "d1_database": ""} | (raw.get("cloudflare") or {})
    if target == "cloudflare" and not (cloudflare["pages_project"] and cloudflare["d1_database"]):
        raise ConfigError(f"{path}: a cloudflare target needs cloudflare.pages_project and cloudflare.d1_database")
    return {
        "path": str(path),
        "target": target,
        "corpus": raw.get("corpus", "corpus"),
        "operators": list(operators),
        "models": slots,
        "retrieval": retrieval,
        "local": local,
        "cloudflare": cloudflare,
        # Offline only when nothing leaves the machine. The UI shows this on every screen.
        "offline": target == "local" and all(s["provider"] in ("local", "off") for s in slots.values()),
    }


CONFIG_PATH = Path(os.environ.get("WSC_CONFIG", REPO_ROOT / "config" / "local.yaml"))
if not CONFIG_PATH.is_absolute():
    CONFIG_PATH = REPO_ROOT / CONFIG_PATH
CONFIG = load(CONFIG_PATH)

CORPUS_DIR = Path(os.environ.get("WSC_CORPUS_DIR", REPO_ROOT / CONFIG["corpus"]))
DATA_DIR = Path(os.environ.get("WSC_DATA_DIR", API_DIR / "data"))
MODEL_DIR = Path(os.environ.get("WSC_MODEL_DIR", API_DIR / "models"))
AUDIT_PATH = Path(os.environ.get("WSC_AUDIT_PATH", REPO_ROOT / "audit" / "log.jsonl"))
UI_DIR = REPO_ROOT / "ui" / "out"

INDEX_PATH = DATA_DIR / "index.sqlite"
KEYS_DIR = DATA_DIR / "keys"
ROSTER_PATH = DATA_DIR / "roster.json"
ABBREVIATIONS_PATH = API_DIR / "retrieval" / "abbreviations.yaml"
SCOPE_PATH = API_DIR / "retrieval" / "scope.yaml"

EMBED_PROVIDER = CONFIG["models"]["embed"]["provider"]
EMBED_MODEL = CONFIG["models"]["embed"]["model"]
RETRIEVAL = CONFIG["retrieval"]
NODE_ID = "copilot-node-01"
# Demo operators. In production each key is bound to the Sailor's CAC at enrollment.
OPERATOR_IDS = CONFIG["operators"]
