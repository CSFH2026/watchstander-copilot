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
    dataset = raw.get("dataset")
    if not isinstance(dataset, str) or not dataset:
        raise ConfigError(f"{path}: dataset must name a folder under corpus/, such as wikihow or ddg")
    return {
        "path": str(path),
        "target": target,
        "dataset": dataset,
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



def load_dataset(name: str, corpus_dir: Path | None = None) -> dict:
    """Reads corpus/<name>/dataset.yaml. A dataset folder may carry a scope.yaml (what it covers)
    and an abbreviations.yaml (shorthand to expand); without them it has no scope lists or shorthand."""
    folder = corpus_dir or (REPO_ROOT / "corpus" / name)
    meta_path = folder / "dataset.yaml"
    if not meta_path.exists():
        found = sorted(p.parent.name for p in (REPO_ROOT / "corpus").glob("*/dataset.yaml"))
        raise ConfigError(f"dataset {name!r}: {meta_path} not found. Datasets: {', '.join(found) or 'none'}")
    meta = yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {}
    kind = meta.get("kind")
    if kind not in ("doctrine", "stand-in"):
        raise ConfigError(f"{meta_path}: kind must be doctrine or stand-in, found {kind!r}")
    for key in ("title", "source", "license"):
        if not meta.get(key):
            raise ConfigError(f"{meta_path}: {key} is required")
    optional = lambda fname: folder / fname if (folder / fname).exists() else None
    return {
        "name": name,
        "dir": folder,
        "title": str(meta["title"]),
        "kind": kind,
        "source": str(meta["source"]),
        "license": str(meta["license"]),
        "examples": [str(x) for x in meta.get("examples") or []][:6],
        "retrieval": meta.get("retrieval") or {},
        "scope_path": optional("scope.yaml"),
        "abbreviations_path": optional("abbreviations.yaml"),
    }


# WSC_DATASET switches the dataset without editing the config file.
DATASET_NAME = os.environ.get("WSC_DATASET") or CONFIG["dataset"]
_corpus_override = os.environ.get("WSC_CORPUS_DIR")
DATASET = load_dataset(DATASET_NAME, Path(_corpus_override) if _corpus_override else None)
CORPUS_DIR = DATASET["dir"]
DATA_DIR = Path(os.environ.get("WSC_DATA_DIR", API_DIR / "data"))
MODEL_DIR = Path(os.environ.get("WSC_MODEL_DIR", API_DIR / "models"))
AUDIT_PATH = Path(os.environ.get("WSC_AUDIT_PATH", REPO_ROOT / "audit" / "log.jsonl"))
UI_DIR = REPO_ROOT / "ui" / "out"

# One index per dataset, so switching back and forth does not re-embed every time.
INDEX_PATH = DATA_DIR / f"index-{DATASET_NAME}.sqlite"
KEYS_DIR = DATA_DIR / "keys"
ROSTER_PATH = DATA_DIR / "roster.json"
ABBREVIATIONS_PATH = DATASET["abbreviations_path"]
SCOPE_PATH = DATASET["scope_path"]

EMBED_PROVIDER = CONFIG["models"]["embed"]["provider"]
EMBED_MODEL = CONFIG["models"]["embed"]["model"]
# The preset sets the floors for its embed model; a dataset may override them per provider,
# because the cosines a corpus produces depend on both the text and the model.
_dataset_retrieval = DATASET["retrieval"].get(EMBED_PROVIDER) or {}
_unknown = set(_dataset_retrieval) - set(RETRIEVAL_DEFAULTS)
if _unknown:
    raise ConfigError(f"{CORPUS_DIR / 'dataset.yaml'}: retrieval.{EMBED_PROVIDER} has unknown keys {sorted(_unknown)}")
RETRIEVAL = CONFIG["retrieval"] | {k: type(RETRIEVAL_DEFAULTS[k])(v) for k, v in _dataset_retrieval.items()}
NODE_ID = "copilot-node-01"
# Demo operators. In production each key is bound to the Sailor's CAC at enrollment.
OPERATOR_IDS = CONFIG["operators"]
