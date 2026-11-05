"""Questions for the wikiHow stand-in dataset, through the API like a Sailor would ask them.

Runs only when the backend serves wikiHow: WSC_DATASET=wikihow make test, or against a deployed
backend whose /api/health names the wikihow dataset. The doctrine tests skip in that case.
"""
import os

import pytest
from fastapi.testclient import TestClient

BASE_URL = os.environ.get("WSC_BASE_URL")
OP = "EOOW-01"

# Question -> the list title it must find first.
COVERED = {
    "how can I tell if an iphone is refurbished": "Identify a Refurbished iPhone",
    "find the mac address of a computer from its ip": "Get a MAC Address from an IP Remotely",
    "hide the posts I liked on facebook": "Prevent Others from Seeing Posts You Like on Facebook",
    "take a screenshot on windows": "Take a Screenshot in Microsoft Windows",
    "send an encrypted email from gmail on my android phone": "Send an Encrypted Email in Gmail on Android",
    "my phone screen keeps dimming when it is unplugged": "Stop a Mac's Screen From Dimming when Not Plugged in",
    "I can't play flash videos anymore": "Play Old Flash Games",
}

# No list covers these; a near miss would be an untrusted answer, so each must be refused.
UNCOVERED = [
    "check my car oil level", "lower my electric bill", "fix a leaky faucet", "change a flat tire",
    "clean a cast iron pan", "remove a stripped screw", "stop my dog from barking", "install a ceiling fan",
    "jump start a car battery", "boil eggs", "pizza for lunch", "tell me a joke",
]


@pytest.fixture(scope="module")
def client():
    if BASE_URL:
        import httpx
        with httpx.Client(base_url=BASE_URL, timeout=30) as c:
            yield c
        return
    from main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module", autouse=True)
def only_on_wikihow(client):
    dataset = client.get("/api/health").json().get("dataset", {}).get("name")
    if dataset != "wikihow":
        pytest.skip(f"backend serves {dataset}, not wikihow")


def ask(client, text):
    return client.post("/api/query", json={"operator_id": OP, "text": text}).json()


@pytest.mark.parametrize("text,title", COVERED.items())
def test_covered_question_finds_its_list(client, text, title):
    r = ask(client, text)
    assert r["procedure"] and r["procedure"]["title"] == title, r.get("notice")
    assert "wikihow.com" in r["procedure"]["source"]
    assert r["steps"][0]["state"] == "next" and all(s["requires"] for s in r["steps"][1:])


@pytest.mark.parametrize("text", UNCOVERED)
def test_uncovered_question_is_refused(client, text):
    r = ask(client, text)
    assert r["procedure"] is None and r["confidence"] == "none", r["procedure"]


def test_steps_must_go_in_order(client):
    client.post("/api/reset", json={"operator_id": OP})
    r = ask(client, "take a screenshot on windows")
    pid = r["procedure"]["procedure_id"]
    second = r["steps"][1]["step_id"]
    blocked = client.post("/api/action", json={"operator_id": OP, "procedure_id": pid, "step_id": second}).json()
    assert blocked["allowed"] is False and "requires step 01" in blocked["reason"]
