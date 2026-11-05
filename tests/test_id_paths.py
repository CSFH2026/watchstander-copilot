"""Identities and procedure ids name files, so a bad one is refused before any path is built.

Findings 3fb1be7f, f9daa22a, db2bedb8, f21414f8 and eb5028a6 of the Nov 5 security review.
"""
import importlib.util
import os
import stat

import pytest

import casrep
from config import KEYS_DIR, NODE_ID, OPERATOR_IDS, REPO_ROOT
from trust import keys

BAD_IDS = ["../roster", "../../etc/passwd", "EOOW-01/../x", "/abs", "", ".hidden", "a" * 65, "EOOW 01", "EOOW-01\x00"]


@pytest.mark.parametrize("identity", [NODE_ID, *OPERATOR_IDS, "EOOW-03", "node_2"])
def test_known_identities_keep_their_key_file(identity):
    assert keys.key_path(identity) == KEYS_DIR / f"{identity}.key"


@pytest.mark.parametrize("identity", BAD_IDS)
def test_bad_identities_are_refused_by_enroll_and_sign(identity):
    with pytest.raises(ValueError):
        keys.key_path(identity)
    with pytest.raises(ValueError):
        keys.enroll(identity)
    with pytest.raises(ValueError):
        keys.sign(identity, b"hash")


def test_a_symlink_out_of_the_keys_folder_is_refused(tmp_path):
    inside = tmp_path / "keys"
    inside.mkdir()
    (inside / "EOOW-09.key").symlink_to(tmp_path / "elsewhere.key")
    with pytest.raises(ValueError):
        keys.key_path("EOOW-09", inside)


def test_new_key_files_are_owner_only_from_the_start(tmp_path):
    path = tmp_path / "EOOW-05.key"
    keys.write_secret(path, b"x" * 32)
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    # An older file with wide rights is narrowed when it is written again.
    os.chmod(path, 0o644)
    keys.write_secret(path, b"y" * 32)
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600 and path.read_bytes() == b"y" * 32


def test_enroll_writes_an_owner_only_key():
    keys.enroll("EOOW-07")
    assert stat.S_IMODE(os.stat(KEYS_DIR / "EOOW-07.key").st_mode) == 0o600


def test_known_procedure_loads():
    assert casrep.has_procedure("EOCC-SSGTG-LLOP")
    assert casrep.load_procedure(casrep.CORPUS, "EOCC-SSGTG-LLOP")["procedure_id"] == "EOCC-SSGTG-LLOP"


@pytest.mark.parametrize("pid", ["EOCC-NOPE-NOPE", "WH-123"])
def test_unknown_procedure_is_absent(pid):
    assert casrep.has_procedure(pid) is False


@pytest.mark.parametrize("pid", ["../ddg/EOCC-SSGTG-LLOP", "../../README", "EOCC/../x", "eocc-ssgtg-llop", "", None, 7])
def test_bad_procedure_ids_are_refused(pid):
    assert casrep.has_procedure(pid) is False
    with pytest.raises(casrep.CasrepError):
        casrep.load_procedure(casrep.CORPUS, pid)


def _wikihow():
    spec = importlib.util.spec_from_file_location("import_wikihow", REPO_ROOT / "scripts" / "import_wikihow.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize("pageid", ["../../x", "1/../../y", "12a", ""])
def test_wikihow_import_skips_a_non_numeric_page_id(tmp_path, monkeypatch, pageid):
    mod = _wikihow()
    monkeypatch.setattr(mod, "OUT", tmp_path)
    row = {"pageid": pageid, "title": "Fix a Thing", "result": "1. Do it.\n2. Check it."}
    assert mod.write(row) is False
    assert list(tmp_path.rglob("*")) == []


def test_wikihow_import_writes_a_numeric_page_id(tmp_path, monkeypatch):
    mod = _wikihow()
    monkeypatch.setattr(mod, "OUT", tmp_path)
    row = {"pageid": "123", "title": "Fix a Thing", "result": "1. Do it.\n2. Check it."}
    assert mod.write(row) is True
    assert [p.name for p in tmp_path.iterdir()] == ["WH-123.md"]
