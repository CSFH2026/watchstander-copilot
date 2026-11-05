"""make verify must check the log the server writes, and must not call a missing log intact."""
import os
import shutil
import subprocess
import sys

import pytest

from config import NODE_ID, REPO_ROOT

API = REPO_ROOT / "api"


@pytest.fixture
def log(tmp_path):
    from trust import keys
    from trust.audit import AuditLog
    keys.ensure_identities()
    path = tmp_path / "log.jsonl"
    audit = AuditLog(path)
    for n in range(3):
        audit.append(NODE_ID, "query", {"text": f"test {n}"}, NODE_ID)
    return path


def _verify(*args, audit_path=None):
    env = dict(os.environ)
    if audit_path is not None:
        env["WSC_AUDIT_PATH"] = str(audit_path)
    return subprocess.run([sys.executable, "-m", "trust.verify", *args], cwd=API, env=env, capture_output=True, text=True)


def test_no_argument_checks_wsc_audit_path(log):
    r = _verify(audit_path=log)
    assert r.returncode == 0, r.stdout
    assert "3 entries" in r.stdout and str(log) in r.stdout


def test_missing_log_fails(tmp_path):
    missing = tmp_path / "nothing-here.jsonl"
    r = _verify(audit_path=missing)
    assert r.returncode == 1
    assert r.stdout.startswith("MISSING") and str(missing) in r.stdout
    assert _verify(str(missing)).returncode == 1


def test_broken_log_fails(log):
    lines = log.read_text(encoding="utf-8").splitlines()
    lines[1] = lines[1].replace("test 1", "test X")
    log.write_text("\n".join(lines) + "\n", encoding="utf-8")
    r = _verify(audit_path=log)
    assert r.returncode == 1 and "BROKEN at entry 2" in r.stdout


def test_make_verify_follows_wsc_audit_path(log):
    make = shutil.which("make")
    if not make:
        pytest.skip("make is not installed")
    if not (REPO_ROOT / ".venv" / "bin" / "python").exists():
        pytest.skip("make verify runs .venv/bin/python, and this checkout has no .venv")
    env = dict(os.environ, WSC_AUDIT_PATH=str(log))
    r = subprocess.run([make, "-s", "verify"], cwd=REPO_ROOT, env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "3 entries" in r.stdout and str(log) in r.stdout
