"""The audit log survives odd text and a damaged tail, and the verifier never calls an empty log intact.

Findings 974a425a, adcc0048 and 6c5c51b2 of the Nov 5 security review.
"""
import json
import os
import subprocess
import sys

import pytest

from config import NODE_ID, REPO_ROOT

API = REPO_ROOT / "api"


@pytest.fixture
def log(tmp_path):
    from trust import keys
    keys.ensure_identities()
    return tmp_path / "log.jsonl"


def _verify_cli(path):
    env = dict(os.environ, WSC_AUDIT_PATH=str(path))
    return subprocess.run([sys.executable, "-m", "trust.verify"], cwd=API, env=env, capture_output=True, text=True)


@pytest.mark.parametrize("sep", [" ", " ", "\u0085", "\x0b", "\x1c"])
def test_line_separators_in_a_query_keep_one_record(log, sep):
    from trust.audit import AuditLog, verify_file
    audit = AuditLog(log)
    audit.append(NODE_ID, "query", {"text": f"low lube{sep}oil pressure"}, NODE_ID)
    audit.append(NODE_ID, "query", {"text": "second"}, NODE_ID)
    assert [e["seq"] for e in audit.entries()] == [1, 2]
    assert verify_file(log) == {"ok": True, "entries": 2}
    # A restart reads the same tail and keeps counting.
    assert AuditLog(log).append(NODE_ID, "query", {"text": "third"}, NODE_ID)["seq"] == 3


def test_a_cut_last_line_does_not_stop_the_server(log, capsys):
    from trust.audit import AuditLog, verify_file
    audit = AuditLog(log)
    for n in range(3):
        audit.append(NODE_ID, "query", {"text": f"q{n}"}, NODE_ID)
    text = log.read_text(encoding="utf-8")
    log.write_text(text[: len(text) - 40], encoding="utf-8")  # the last record loses its end, as in a crash mid-write
    reopened = AuditLog(log)
    assert "unreadable" in capsys.readouterr().out
    assert reopened.append(NODE_ID, "query", {"text": "after"}, NODE_ID)["seq"] == 3
    r = verify_file(log)
    assert r["ok"] is False and r["broken_seq"] == 3


def test_a_log_of_only_garbage_starts_and_fails_verify(log):
    from trust.audit import AuditLog, verify_file
    log.write_text("not json\n", encoding="utf-8")
    assert AuditLog(log).append(NODE_ID, "query", {"text": "x"}, NODE_ID)["seq"] == 1
    assert verify_file(log)["ok"] is False


@pytest.mark.parametrize("content", ["", "\n\n  \n"])
def test_verify_cli_refuses_an_empty_log(log, content):
    log.write_text(content, encoding="utf-8")
    r = _verify_cli(log)
    assert r.returncode == 1 and r.stdout.startswith("EMPTY"), r.stdout


def test_verify_cli_passes_a_good_log(log):
    from trust.audit import AuditLog
    AuditLog(log).append(NODE_ID, "query", {"text": "x"}, NODE_ID)
    r = _verify_cli(log)
    assert r.returncode == 0 and "1 entries" in r.stdout


def test_server_api_still_reads_a_fresh_log_as_intact(log):
    """The UI's Verify on a fresh demo log says 0 entries; only the command line treats empty as a failure."""
    from trust.audit import AuditLog, verify_file
    AuditLog(log)
    assert verify_file(log) == {"ok": True, "entries": 0}
    assert json.loads(json.dumps(verify_file(log)))["entries"] == 0
