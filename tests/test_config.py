"""The hoster config: both presets load, and the combinations that cannot work are refused at start."""
from pathlib import Path

import pytest

from config import ConfigError, REPO_ROOT, load, load_dataset

PRESETS = REPO_ROOT / "config"


def write(tmp_path: Path, text: str) -> Path:
    p = tmp_path / "c.yaml"
    p.write_text(text, encoding="utf-8")
    return p


BASE = """
target: {target}
dataset: ddg
operators: [EOOW-01]
models:
  embed: {{provider: {embed}, model: some-model}}
  transcribe: {{provider: {transcribe}, model: whisper}}
cloudflare: {{pages_project: p, d1_database: d}}
"""


def test_local_preset_is_offline():
    c = load(PRESETS / "local.yaml")
    assert c["target"] == "local" and c["offline"] is True
    assert c["models"]["embed"] == {"provider": "local", "model": "BAAI/bge-small-en-v1.5"}


def test_cloudflare_preset_is_not_offline():
    c = load(PRESETS / "cloudflare.yaml")
    assert c["target"] == "cloudflare" and c["offline"] is False
    assert c["models"]["embed"]["model"] == "@cf/baai/bge-small-en-v1.5"


def test_bare_off_is_read_as_off(tmp_path):
    c = load(write(tmp_path, BASE.format(target="local", embed="local", transcribe="off")))
    assert c["models"]["transcribe"]["provider"] == "off"


def test_local_target_with_a_cloud_model_is_allowed_but_not_offline(tmp_path):
    c = load(write(tmp_path, BASE.format(target="local", embed="cloudflare", transcribe="off")))
    assert c["offline"] is False


@pytest.mark.parametrize("target,embed,transcribe,message", [
    ("cloudflare", "local", "off", "cannot reach models on a laptop"),
    ("local", "off", "off", "embed cannot be off"),
    ("local", "local", "local", "no provider written yet"),
    ("local", "openai", "off", "provider must be one of"),
    ("aws", "local", "off", "target must be one of"),
])
def test_bad_combinations_are_refused(tmp_path, target, embed, transcribe, message):
    with pytest.raises(ConfigError, match=message):
        load(write(tmp_path, BASE.format(target=target, embed=embed, transcribe=transcribe)))


def test_unknown_retrieval_key_is_refused(tmp_path):
    p = write(tmp_path, BASE.format(target="local", embed="local", transcribe="off") + "retrieval: {min_cos: 0.5}\n")
    with pytest.raises(ConfigError, match="retrieval.min_cos"):
        load(p)


def test_missing_dataset_is_refused(tmp_path):
    p = write(tmp_path, BASE.format(target="local", embed="local", transcribe="off").replace("dataset: ddg\n", ""))
    with pytest.raises(ConfigError, match="dataset must name a folder"):
        load(p)


@pytest.mark.parametrize("name,kind", [("ddg", "doctrine"), ("wikihow", "stand-in")])
def test_shipped_datasets_load(name, kind):
    d = load_dataset(name)
    assert d["kind"] == kind and d["examples"] and d["license"]


def test_unknown_dataset_names_the_ones_that_exist():
    with pytest.raises(ConfigError, match="Datasets: .*ddg"):
        load_dataset("no-such-ship")


def test_dataset_without_scope_or_shorthand_files(tmp_path):
    (tmp_path / "dataset.yaml").write_text("title: t\nkind: stand-in\nsource: s\nlicense: l\n")
    d = load_dataset("tmp", tmp_path)
    assert d["scope_path"] is None and d["abbreviations_path"] is None


def test_demo_preset_is_offline_doctrine():
    # docs/DEMO.md asks about the SSDG casualties, so the judged demo must never load stand-in data.
    c = load(PRESETS / "demo.yaml")
    assert c["target"] == "local" and c["offline"] is True and c["dataset"] == "ddg"
    assert load_dataset(c["dataset"])["kind"] == "doctrine"
