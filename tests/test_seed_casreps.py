"""The example CASREPs: they follow the board's rules, cover what the demo shows, and leave the demo questions clean. No network."""
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

import casrep
import known

_spec = importlib.util.spec_from_file_location("seed_casreps", Path(__file__).parent.parent / "scripts" / "seed_casreps.py")
seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed)

NOW = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)
CFG = {"CASREP_URL": "http://board.test", **casrep.DEFAULTS}
SYSTEMS, ABBREVIATIONS = known.load_corpus_index()
TERMS = {pid: known.system_terms(s, ABBREVIATIONS) for pid, s in SYSTEMS.items()}
FINALS = [(s, seed.final(s)) for s in seed.SCENARIOS]
OPEN = [s for s, f in FINALS if f["status"] == "open"]


def as_cached(body: dict) -> dict:
    """The draft as the copilot's cache would summarize it, for matching."""
    return known.summarize({"casrep": {"id": "x", "serial": body["serial"], "current_step": 0, "status": "open"},
                            "versions": [body], "events": []}, "http://site")


def test_serials_and_keys_are_unique_and_valid():
    serials = [s["serial"] for s in seed.SCENARIOS]
    assert len(set(serials)) == len(serials)
    assert len({s["key"] for s in seed.SCENARIOS}) == len(serials)
    assert all(re.fullmatch(r"N99999/\d{4}", x) for x in serials)


@pytest.mark.parametrize("s", seed.SCENARIOS, ids=lambda s: s["key"])
def test_draft_fits_the_board_and_names_its_procedure(s):
    body = seed.draft(s, NOW, CFG)
    assert casrep.has_procedure(s["procedure"])
    assert body["report_type"] == "INITIAL" and body["serial"] == s["serial"]
    assert len(body["equipment"]) <= casrep.MAX_EQUIPMENT
    assert len(body["description"]) <= casrep.MAX_TEXT and len(body["remarks"]) <= casrep.MAX_TEXT
    assert s["query"] in body["description"]
    assert seed.marker(s) in body["remarks"] and "not from a signed audit log" in body["remarks"]
    assert as_cached(body)["procedure_ids"] == [s["procedure"]]


def test_the_examples_cover_every_stage_category_and_report_type():
    assert {f["step"] for s, f in FINALS if f["status"] == "open"} == set(range(len(seed.STAGES)))
    assert {f["category"] for _, f in FINALS} == {2, 3, 4}
    assert {f["type"] for _, f in FINALS} == {"INITIAL", "UPDATE", "CORRECT", "CASCOR", "CASCAN"}
    assert {f["status"] for _, f in FINALS} == {"open", "corrected", "cancelled"}
    ops = [op for s in seed.SCENARIOS for op in s["script"]]
    assert any(op[0] == "edit" and op[2].get("report_type") == "UPDATE" and {"etr", "parts"} & set(op[2]) for op in ops)
    assert any(op[0] == "return" for op in ops) and any(op[0] == "comment" for op in ops)


def test_a_plan_the_board_would_refuse_fails_before_any_call():
    with pytest.raises(ValueError, match="after release"):
        seed.plan({"key": "bad", "category": 2, "script": [*seed.release(), *seed.approve(1)]})
    with pytest.raises(ValueError, match="closed"):
        seed.plan({"key": "bad", "category": 2, "script": [*seed.edit(1, report_type="CASCAN"), *seed.release(), *seed.note("late")]})


@pytest.mark.parametrize("procedure_id", seed.DEMO_CLEAN)
def test_no_open_example_shows_on_a_demo_question(procedure_id):
    for s in OPEN:
        c = as_cached(seed.draft(s, NOW, CFG))
        assert known.match(procedure_id, TERMS[procedure_id], c, ABBREVIATIONS) is None, s["serial"]


@pytest.mark.parametrize("s", OPEN, ids=lambda s: s["key"])
def test_every_open_example_shows_on_its_own_procedure(s):
    c = as_cached(seed.draft(s, NOW, CFG))
    assert known.match(s["procedure"], TERMS[s["procedure"]], c, ABBREVIATIONS) == "procedure"


def test_role_keys_come_from_a_dev_vars_file_and_are_all_needed(tmp_path):
    keys = {r: f"k-{i}" for i, r in enumerate(seed.CHAIN)}
    f = tmp_path / ".dev.vars"
    f.write_text(f"FRONTEND_URL=x\nROLE_KEYS='{json.dumps(keys)}'\n")
    assert seed.read_role_keys({}, f) == keys
    with pytest.raises(casrep.CasrepError, match="no key for Division Officer, Department Head, CHENG, XO, CO;"):
        seed.read_role_keys({"CASREP_ROLE_KEYS": '{"Originator": "a"}'}, None)
