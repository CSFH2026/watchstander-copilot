"""Deterministic guardrail for casualty control steps.

State is the set of acknowledged steps per operator. A step is allowed only when every
step it requires is already acknowledged. The engine never asks a model; the corpus's
requires: and danger: fields are the whole rule set, so judges can read every rule.
"""
from collections import defaultdict


def _short(step_id: str) -> str:
    return step_id.rsplit("-", 1)[-1]


class PolicyEngine:
    def __init__(self, step_by_id: dict[str, dict], steps_by_procedure: dict[str, list[dict]]):
        self.step_by_id = step_by_id
        self.steps_by_procedure = steps_by_procedure
        self.done: dict[str, set[str]] = defaultdict(set)

    def reset(self, operator_id: str) -> None:
        self.done.pop(operator_id, None)

    def states(self, operator_id: str, procedure_id: str) -> list[dict]:
        done = self.done[operator_id]
        out = []
        for s in self.steps_by_procedure.get(procedure_id, []):
            if s["step_id"] in done:
                state = "done"
            elif all(r in done for r in s["requires"]):
                state = "next"
            else:
                state = "locked"
            out.append({k: s[k] for k in ("step_id", "seq", "text", "requires", "danger")} | {"state": state})
        return out

    def check(self, operator_id: str, procedure_id: str, step_id: str) -> tuple[bool, str]:
        step = self.step_by_id.get(step_id)
        if step is None:
            return False, f"Blocked: {step_id} is not a step in any authorized procedure."
        if step["procedure_id"] != procedure_id:
            return False, (f"Blocked: step {_short(step_id)} belongs to {step['procedure_id']}, "
                           f"not the active procedure {procedure_id}.")
        done = self.done[operator_id]
        if step_id in done:
            return False, f"Blocked: step {_short(step_id)} is already acknowledged."
        missing = [r for r in step["requires"] if r not in done]
        if missing:
            need = ", ".join(_short(m) for m in missing)
            reason = f"Blocked: step {_short(step_id)} requires step {need} first."
            if step["danger"]:
                reason += f" Danger: {step['danger']}"
            return False, reason
        note = f" Caution: {step['danger']}" if step["danger"] else ""
        return True, f"Step {_short(step_id)} acknowledged.{note}"

    def apply(self, operator_id: str, procedure_id: str, step_id: str) -> tuple[bool, str]:
        allowed, reason = self.check(operator_id, procedure_id, step_id)
        if allowed:
            self.done[operator_id].add(step_id)
        return allowed, reason

    def replay(self, entries: list[dict]) -> None:
        """Rebuilds state from the audit log, so a restart mid-drill keeps every acknowledgement."""
        for e in entries:
            p = e.get("payload") or {}
            if e.get("event") == "action" and p.get("allowed"):
                self.done[e["actor"]].add(p["step_id"])
            elif e.get("event") == "reset":
                self.done.pop(e["actor"], None)
