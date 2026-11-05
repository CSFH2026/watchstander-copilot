# Interface contracts

Version 2.1, Wednesday 4:00 PM: the happy-path API plus scope and ambiguity.
Any change is posted in `#copilot-dev` and this file is updated before the code merges.
One process serves everything on `http://127.0.0.1:8000`: the API under `/api/`, the built UI at `/`.
In development the UI runs on `http://127.0.0.1:3100` and calls the API at `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000`.

## Corpus file

One markdown file per procedure under `corpus/<dataset>/`, beside that dataset's `dataset.yaml` ([HOSTING.md](HOSTING.md)).
Required front matter: `procedure_id`, `title`, `source`, `symptoms`.
Optional: `status`, `causes`, `effects`, `associated` (a list of other procedure ids).

```markdown
---
procedure_id: EOCC-SSDG-LLOP
title: Low Lube Oil Pressure, Ship Service Diesel Generator
source: COMSCINST 3541.6A, exercise D-15
symptoms: [low lube oil pressure alarm, LO pressure below 25 psig]
---
1. [step: EOCC-SSDG-LLOP-01] Verify low lube oil pressure at the local gauge. requires: none
2. [step: EOCC-SSDG-LLOP-02] Report the casualty to the EOOW. requires: 01
5. [step: EOCC-SSDG-LLOP-05] Secure the affected generator. requires: 04. danger: never before 04
```

## Shared shapes

```ts
type StepState = "done" | "next" | "locked";   // done = acknowledged, next = allowed now, locked = a requirement is missing

type Step = {
  step_id: string;          // "EOCC-SSDG-LLOP-05"
  seq: number;              // 5
  text: string;
  requires: string[];       // ["EOCC-SSDG-LLOP-04"]
  danger: string | null;    // text after "danger:", or null
  state: StepState;
};

type AuditRef = { seq: number; hash: string; prev_hash: string; signature: string; signer: string };
```

## `GET /api/health`

```json
{"ok": true, "offline": true, "procedures": 3, "steps": 27, "model": "BAAI/bge-small-en-v1.5", "operator_ids": ["EOOW-01", "EOOW-02"],
 "target": "local", "models": {"embed": "local:BAAI/bge-small-en-v1.5", "transcribe": "off", "rewrite": "off", "rerank": "off"}}
```

`target` and `models` come from the hoster config ([HOSTING.md](HOSTING.md)).
`dataset` is `{"name", "title", "kind", "source", "license", "examples"}` from the dataset's `dataset.yaml`; `kind` is `doctrine` or `stand-in`.
`offline` is true only when the target is `local` and every model slot is `local` or `off`.

## `POST /api/query`

```json
{"operator_id": "EOOW-01", "text": "low lube oil pressure on number two SSDG", "input": "typed"}
```

```json
{
  "query_id": "q-0003",
  "latency_ms": 84,
  "procedure": {"procedure_id": "EOCC-SSDG-LLOP", "title": "Low Lube Oil Pressure, Ship Service Diesel Generator",
                "source": "COMSCINST 3541.6A ...", "score": 0.032, "symptoms": ["low lube oil pressure alarm"]},
  "steps": [Step, ...],                              // every step of the top procedure, in order
  "alternates": [{"procedure_id": "EOCC-SSDG-HJWT", "title": "...", "score": 0.016}],
  "confidence": "clear",                             // "clear" | "ambiguous" | "none"
  "notice": null,                                    // a sentence for the Sailor when confidence is not "clear"
  "matched": {"keyword": ["lube", "oil", "pressure"], "semantic_top": "EOCC-SSDG-LLOP-01", "max_cosine": 0.71},  // best cosine before the floors
  "audit": AuditRef                                  // the query is logged and signed by the node key
}
```

An empty, unmatched, or out-of-scope query returns `200` with `"procedure": null`, `"steps": []`, `"confidence": "none"`,
and a `notice` such as "No authorized procedure is held for gas turbine generator. Use the EOCC binder."
Scope comes from the dataset's `corpus/<dataset>/scope.yaml`: equipment we cover, equipment we do not, and words too generic to count.
`"ambiguous"` means the second procedure scored within 6% of the first; the UI shows both and the Sailor picks.

## `POST /api/action`

```json
{"operator_id": "EOOW-01", "procedure_id": "EOCC-SSDG-LLOP", "step_id": "EOCC-SSDG-LLOP-05", "action": "acknowledge"}
```

```json
{
  "allowed": false,
  "reason": "Blocked: step 05 requires step 04 first. Danger: never before 04 while the affected unit is the only source on the bus.",
  "step_id": "EOCC-SSDG-LLOP-05",
  "steps": [Step, ...],          // the procedure after this action, so the UI redraws from one source
  "audit": AuditRef              // allowed and blocked actions are both logged, signed by the operator key
}
```

Reasons the policy engine blocks: a step not in any authorized procedure, a step from a different procedure than `procedure_id`, a step already acknowledged, a step whose `requires:` are not all done.

## `POST /api/reset`

`{"operator_id": "EOOW-01"}` clears that operator's acknowledged steps and logs a `reset` event. Returns `{"ok": true, "audit": AuditRef}`.

## `GET /api/audit?limit=20`

Newest first: `{"entries": [{"seq": 12, "ts": "...", "actor": "EOOW-01", "event": "action", "summary": "acknowledge EOCC-SSDG-LLOP-01: allowed", "hash": "...", "prev_hash": "...", "signer": "EOOW-01"}]}`

## `GET /api/audit/verify`

`{"ok": true, "entries": 12}` or `{"ok": false, "entries": 12, "broken_seq": 7, "reason": "payload hash does not match"}`.

## Audit log file (trust layer owns)

Append-only JSON lines in `audit/log.jsonl`. Each line carries `seq`, `ts`, `actor`, `event`, `payload`, `payload_hash`,
`prev_hash`, `hash`, `signer`, `signature`. `hash` is SHA-256 over the other fields; `signature` is Ed25519 over `hash`.
`make verify` and `GET /api/audit/verify` recompute every hash and check every signature against `api/data/roster.json`.
