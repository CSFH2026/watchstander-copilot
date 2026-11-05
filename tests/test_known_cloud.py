"""The cloud matcher (cloud/src/casreps.ts) gives the same known casualties as api/known.py.

Builds the TypeScript with the cloud's own esbuild and runs it in node, so it skips where the cloud
toolchain or its generated bundle is not installed.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

import known

ROOT = Path(__file__).resolve().parent.parent
ESBUILD = ROOT / "cloud" / "node_modules" / "esbuild" / "bin" / "esbuild"
EQUIPMENT = ["Gas Turbine Generator 1 Air Starter", "Ship Service Diesel Generator 2", "AN/SPY-1D Chilled Water Pump 2",
             "Air Conditioning Plant 2", "Main Reduction Gear Lube Oil Purifier", "Steering Gear Hydraulic Pump 2", "Fire Pump 3",
             "Potable Water Pump 2", "Firemain Isolation Valve FM-12", "SSGTG 2 lube oil pump", "LM2500 number 2 vibration"]

pytestmark = pytest.mark.skipif(not (ESBUILD.exists() and shutil.which("node") and (ROOT / "cloud" / "data" / "bundle.json").exists()),
                                reason="needs cloud/node_modules, node, and cloud/data from python -m retrieval.export")


def test_cloud_matcher_agrees_with_the_laptop(tmp_path):
    systems, abbreviations = known.load_corpus_index()
    terms = {pid: known.system_terms(s, abbreviations) for pid, s in systems.items()}
    expected = {e: [p for p in sorted(systems) if known.match(p, terms[p], {"equipment": e, "procedure_ids": []}, abbreviations)]
                for e in EQUIPMENT}

    subprocess.run([str(ESBUILD), str(ROOT / "cloud" / "src" / "casreps.ts"), "--bundle", "--format=esm", "--platform=neutral",
                    f"--outfile={tmp_path / 'casreps.mjs'}", "--log-level=warning"], check=True)
    (tmp_path / "run.mjs").write_text(
        "import { match } from './casreps.mjs';\n"
        f"const pids = {json.dumps(sorted(systems))}, eq = {json.dumps(EQUIPMENT)};\n"
        "console.log(JSON.stringify(Object.fromEntries(eq.map((e) => [e, pids.filter((p) => match(p, { equipment: e, procedure_ids: [] }))]))));\n")
    got = json.loads(subprocess.run(["node", str(tmp_path / "run.mjs")], check=True, capture_output=True, text=True).stdout)
    assert got == expected
