"""Make targets and test runs: no live default for e2e-cloud, no shell text from QUERY, no key folders left behind.

Findings 3eb58481, 0ff77306 and 8b35533b of the Nov 5 security review.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from config import REPO_ROOT

MAKE = shutil.which("make")
needs_make = pytest.mark.skipif(not MAKE, reason="make is not installed")
needs_venv = pytest.mark.skipif(not (REPO_ROOT / ".venv" / "bin" / "python").exists(),
                                reason="the casrep target runs .venv/bin/python, and this checkout has no .venv")


def _make(*args, **env):
    clean = {k: v for k, v in os.environ.items() if k not in ("E2E_URL", "QUERY", "MAKEFLAGS", "MAKELEVEL")}
    return subprocess.run([MAKE, "-s", *args], cwd=REPO_ROOT, env=clean | env, capture_output=True, text=True, timeout=120)


@needs_make
def test_e2e_cloud_without_a_url_stops_before_anything_runs(tmp_path):
    # Defused even if the guard ever breaks: npm and npx are stubs that only leave a mark, and PY is false,
    # so no run of this test can reach a deployment.
    calls = tmp_path / "calls"
    for tool in ("npm", "npx"):
        stub = tmp_path / tool
        stub.write_text(f"#!/bin/sh\necho {tool} >> {calls}\n")
        stub.chmod(0o755)
    r = _make("e2e-cloud", "PY=false", "E2E_BASE_URL=", PATH=f"{tmp_path}:{os.environ['PATH']}")
    assert r.returncode != 0
    assert "needs E2E_URL" in r.stdout
    assert not calls.exists()


@needs_make
def test_e2e_cloud_passes_the_named_url_quoted():
    r = _make("-n", "e2e-cloud", E2E_URL="https://example.test")
    assert r.returncode == 0, r.stderr
    assert 'E2E_BASE_URL="$E2E_URL"' in r.stdout and 'WSC_BASE_URL="$E2E_URL"' in r.stdout


@needs_make
@needs_venv
def test_query_reaches_the_script_as_one_word(tmp_path):
    marker, log = tmp_path / "ran", tmp_path / "log.jsonl"
    log.touch()
    r = _make("casrep", "DRY=1", f"QUERY=q-1; touch {marker}", WSC_AUDIT_PATH=str(log))
    assert r.returncode != 0
    assert not marker.exists()
    assert f"'q-1; touch {marker}' is not a query id" in r.stdout + r.stderr


def test_the_test_temp_folder_is_removed_at_exit():
    env = {k: v for k, v in os.environ.items() if k not in ("WSC_AUDIT_PATH", "WSC_DATA_DIR")}
    code = "import os, runpy; runpy.run_path('tests/conftest.py'); print(os.environ['WSC_DATA_DIR'])"
    r = subprocess.run([sys.executable, "-c", code], cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    folder = Path(r.stdout.strip().splitlines()[-1]).parent
    assert folder.name.startswith("wsc-test-") and not folder.exists()
