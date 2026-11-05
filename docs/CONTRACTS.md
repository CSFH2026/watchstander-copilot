# Interface contracts

Version 2.2: ranked candidates and `pick`, checklist run identity, source-version pinning, step evidence, flags, and resolution outcomes.
Any change is posted in `#copilot-dev` and this file is updated before the code merges.
One process serves everything on `http://127.0.0.1:8000`: the API under `/api/`, the built UI at `/`.
In development the UI runs on `http://127.0.0.1:3100` and calls the API at `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000`.

## Corpus file

One markdown file per procedure under `corpus/<dataset>/`, beside that dataset's `dataset.yaml` ([HOSTING.md](HOSTING.md)).
Required front matter: `procedure_id`, `title`, `source`, `symptoms`.
Optional: `status`, `causes`, `effects`, `associated` (a list of other procedure ids). The ddg files also carry `system` and `tier`.
A step may add `record: prompt | unit | limit` after its `requires:` and optional `danger:` fields. `limit` is optional; add a fourth `training` field only for a training value. The parser exposes this as `{prompt, unit, limit, training_value}`.

```markdown
---
procedure_id: EOCC-SSGTG-LLOP
title: Low Lube Oil Pressure, Ship Service Gas Turbine Generator
source: COMSCINST 3541.6A, exercise D-15
symptoms: [low lube oil pressure alarm on the SSGTG, LUBO PRESS LO]
---
1. [step: EOCC-SSGTG-LLOP-01] Verify low lube oil pressure at the local gauge. requires: none
2. [step: EOCC-SSGTG-LLOP-02] Report the casualty to the EOOW. requires: 01
5. [step: EOCC-SSGTG-LLOP-05] Secure the affected SSGTG. requires: 04. danger: never before 04
8. [step: EOCC-SSGTG-LLOP-08] Check LO pump capacity and the pressure regulator. requires: 07. record: Local LO pressure | psig | min 25
```

## Shared shapes

```ts
type StepState = "done" | "next" | "locked";   // done = acknowledged, next = allowed now, locked = a requirement is missing

type Step = {
  step_id: string;          // "EOCC-SSGTG-LLOP-05"
  seq: number;              // 5
  text: string;
  requires: string[];       // ["EOCC-SSGTG-LLOP-04"]
  danger: string | null;    // text after "danger:", or null
  record?: {prompt: string; unit: string; limit: string | null; training_value: boolean} | null;
  state: StepState;
  audit_seq?: number | null; // the audit entry that acknowledged a done step; null otherwise. Local backend only for now.
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

## `GET /api/examples`

The example chips under the search box, picked for this ship. Read only: it logs nothing and calls no network.

```json
{"examples": [
  {"text": "loss of chilled water to electronics", "procedure_id": "EOCC-AC-CHWL", "reason": "open", "serial": "N99999/0103"},
  {"text": "low lube oil pressure on the GTM", "procedure_id": "EOCC-GTM-LLOP", "reason": "often", "count": 4},
  {"text": "fire in the main engine room", "procedure_id": "EOCC-FIRE-MER", "reason": "example"}
 ], "window_days": 30}
```

At most 6 chips, one per procedure, in this order:
`open`: up to 3 open CASREPs from the known casualties cache whose text names a procedure, highest category first; `serial` is that CASREP's.
`often`: up to 3 procedures that `query` entries in the audit log matched at least twice in the last `window_days` days, most first; `count` is how many times.
`example`: the dataset's fixed `examples` from `dataset.yaml`, as `GET /api/health` sends them, skipping a procedure a chip above already holds.
An `open` or `often` chip's `text` is a symptom from that procedure's own front matter, the first one that finds the procedure as a clear match.
A logged question's own words never show in a chip.
`procedure_id` of an `example` chip is its top match, or null when it finds none.
The Cloudflare backend sends `open` and `example` chips and no `often` chips, since its log is in D1 and is not counted.
A backend without this route makes the UI show `dataset.examples` from `GET /api/health`, as before.

## `POST /api/query`

```json
{"operator_id": "EOOW-01", "text": "low lube oil pressure on number two SSGTG", "input": "typed"}
```

Optional `pick` (80 characters) names a candidate to open instead of the top match: `{"operator_id": "EOOW-01", "text": "...", "pick": "EOCC-SSGTG-HLOT"}`.
The server searches the same text again and opens `pick` only when it is on that question's own `candidates` list; otherwise `422` with a `detail` sentence.
So a refused question can never be opened by a pick.

```json
{
  "query_id": "q-0003",                                  // also the stable run_id for this checklist run
  "latency_ms": 84,
  "procedure": {"procedure_id": "EOCC-SSGTG-LLOP", "title": "Low Lube Oil Pressure, Ship Service Gas Turbine Generator",
                "source": "COMSCINST 3541.6A ...", "score": 0.032, "symptoms": ["low lube oil pressure alarm"],
                "version": "<sha256 of exact procedure file>"},
  "steps": [Step, ...],                              // every step of the top procedure, in order
  "candidates": [Candidate, ...],                    // the top match and up to four others, best first
  "alternates": [{"procedure_id": "EOCC-SSGTG-HLOT", "title": "...", "score": 0.016}],
  "confidence": "clear",                             // "clear" | "ambiguous" | "none"
  "notice": null,                                    // a sentence for the Sailor when confidence is not "clear"
  "matched": {"keyword": ["lube", "oil", "pressure"], "semantic_top": "EOCC-SSGTG-LLOP-01", "max_cosine": 0.71},  // best cosine before the floors
  "audit": AuditRef                                  // the query is logged and signed by the node key
}
```

```ts
type Candidate = {
  rank: number;              // 1 for the top match, then 2, 3, ... in list order
  procedure_id: string; title: string;
  score: number;             // fused RRF score, 0.032 at most; a rank, never a probability
  relative: number;          // score / the top match's score, so 1 for rank 1
  strength: "strong" | "possible" | "weak";
  cosine: number;            // the best cosine between the question and any step of this procedure
  keyword: string[];         // the question's words (after abbreviation expansion) this procedure's steps hold
};
```

`procedure` is `candidates[0]`, or the picked candidate when the query named a `pick`. `alternates` is `candidates[1:3]` in the old shape, kept for older clients.
How the list is built, the same on both backends (`api/retrieval/search.py`, `cloud/src/search.ts`):

1. BM25 and cosine each rank every step; reciprocal rank fusion (`rrf_k` 60) adds `1 / (60 + rank)` from each list; a procedure takes its best step's fused score.
2. The question must pass the scope gate and the cosine floors first, or the list is empty.
3. The top match is listed. Each other procedure is listed only if its own best step passes the same floors: cosine at least `min_cosine`, and a keyword hit or cosine at least `min_cosine_without_keywords`. At most five are listed.
4. `strength` bands `relative`: `strong` at or above `ambiguous_ratio` (0.94, it fits as well as the top), `possible` at or above 0.80, else `weak`.
5. `confidence` is `ambiguous` when the second listed candidate is `strong`.

The UI shows the band as three segments and a word, with `cosine` and "N of M words" (M is `matched.keyword`), and says it is not a probability.
The cloud backend sees cosines only for its 50 nearest steps (Vectorize), so a candidate with no step among them has cosine 0 and is not listed; its floors also differ (`corpus/ddg/dataset.yaml`).

A picked query is logged like any query, signed by the node key. Its summary ends `, picked rank 2 of 5`, and its payload adds `"picked_rank": 2`.
`procedure_id` in the payload is the picked procedure, so the CASREP draft and the policy engine follow what the watch opened.

An empty, unmatched, or out-of-scope query returns `200` with `"procedure": null`, `"steps": []`, `"candidates": []`, `"confidence": "none"`,
and a `notice` such as "No authorized procedure is held for gas turbine generator. Use the EOCC binder."
Scope comes from the dataset's `corpus/<dataset>/scope.yaml`: equipment we cover, equipment we do not, and words too generic to count.
`"ambiguous"` means the second listed procedure scored within 6% of the first; the top match stays open, the UI asks the Sailor to confirm, and one tap opens the other.

## `POST /api/action`

```json
{"operator_id": "EOOW-01", "procedure_id": "EOCC-SSGTG-LLOP", "step_id": "EOCC-SSGTG-LLOP-05", "action": "acknowledge"}
```

```json
{
  "allowed": false,
  "reason": "Blocked: step 05 requires step 04 first. Danger: never before 04 while the affected unit is the only source on the bus.",
  "step_id": "EOCC-SSGTG-LLOP-05",
  "steps": [Step, ...],          // the procedure after this action, so the UI redraws from one source
  "audit": AuditRef              // allowed and blocked actions are both logged, signed by the operator key
}
```

Reasons the policy engine blocks: a step not in any authorized procedure, a step from a different procedure than `procedure_id`, a step already acknowledged, a step whose `requires:` are not all done.

A step done on a printed checklist is entered later with the same call and five optional fields:

```json
{"operator_id": "EOOW-01", "procedure_id": "EOCC-SSGTG-LLOP", "step_id": "EOCC-SSGTG-LLOP-08", "action": "acknowledge",
 "run_id": "q-0003", "procedure_version": "<sha256 from query>", "reading": "28 psig", "note": "steady at LOCOP"}
```

`source` is `"screen"` (the default) or `"paper"`.
`sheet` (40 characters), `reading` (200), `done_at` (40), and `note` (500) are free text, copied from the sheet as written.
The audit payload gets `"source": "paper"` and each field that is not empty, and the summary reads `acknowledge <step_id> from paper: allowed`.
For paper entry, also send `source: "paper"` and `sheet`; the sheet normally equals the run id. Reading/note fields work for both screen and paper actions.
When `run_id` is present, the server requires the matching query to belong to the operator and procedure, and checks the exact procedure version recorded for that query. Older clients may omit run identity and keep the legacy action behavior.
The policy engine checks a paper step the same way, so a step marked done on paper before the step it requires is blocked and logged.
A step's `record:` prompt is optional; entering evidence never blocks acknowledgement by itself.

## Checklist feedback

The query id (`q-NNNN`) is the stable `run_id`. The signed query event records its procedure id and SHA-256 procedure version. Follow-up action, flag, and resolution events carry that run id and version; the audit log is the durable checklist run record.

`POST /api/feedback/flag` records a signed flag without changing policy state:

```json
{"operator_id":"EOOW-01","procedure_id":"EOCC-SSGTG-LLOP","step_id":"EOCC-SSGTG-LLOP-08","run_id":"q-0003","flag":"not_possible","explanation":"Gauge is inaccessible","evidence":"Access panel is obstructed"}
```

`flag` is `not_possible` or `incorrect`. Explanation and evidence are optional free text. A flag never marks a step done or unlocks later steps.

`POST /api/feedback/outcome` records an explicit checklist outcome:

```json
{"operator_id":"EOOW-01","run_id":"q-0003","outcome":"partially_resolved","note":"Pressure is stable but still below normal"}
```

`outcome` is `fully_resolved`, `partially_resolved`, or `unresolved`. A later correction appends another signed resolution event whose `supersedes_seq` points to the earlier outcome; no audit entry is overwritten. Outcome collection does not submit reports or change controlled procedure text.

## `POST /api/reset`

`{"operator_id": "EOOW-01"}` clears that operator's acknowledged steps and logs a `reset` event. Returns `{"ok": true, "audit": AuditRef}`.

## `GET /api/audit?limit=20`

Newest first: `{"entries": [{"seq": 12, "ts": "...", "actor": "EOOW-01", "event": "action", "summary": "acknowledge EOCC-SSGTG-LLOP-01: allowed", "hash": "...", "prev_hash": "...", "signer": "EOOW-01", "procedure_id": "EOCC-SSGTG-LLOP", "step_id": "EOCC-SSGTG-LLOP-01", "allowed": true}]}`
`procedure_id`, `step_id`, and `allowed` are null when the event does not carry them, for example a reset.
`limit` is capped at 200.

## `GET /api/audit/{seq}`

One entry in full, with each check reported on its own instead of stopping at the first failure:
`{"entry": {"seq": 12, "ts": "...", "actor": "EOOW-01", "event": "action", "payload": {...}, "payload_hash": "...", "prev_hash": "...", "hash": "...", "signer": "EOOW-01", "signature": "..."}, "checks": {"prev_link_ok": true, "payload_ok": true, "hash_ok": true, "signature_ok": true}}`
`prev_link_ok` compares `prev_hash` with the hash of entry `seq - 1`. Returns `404` for a seq that is not in the log.
Local backend only for now; the UI falls back to the list row when this route is missing.

## `GET /api/audit/verify`

`{"ok": true, "entries": 12}` or `{"ok": false, "entries": 12, "broken_seq": 7, "reason": "payload hash does not match"}`.

## Audit log file (trust layer owns)

Append-only JSON lines in `audit/log.jsonl`. Each line carries `seq`, `ts`, `actor`, `event`, `payload`, `payload_hash`,
`prev_hash`, `hash`, `signer`, `signature`. `hash` is SHA-256 over the other fields; `signature` is Ed25519 over `hash`.
`make verify` and `GET /api/audit/verify` recompute every hash and check every signature against `api/data/roster.json`.

## CASREP export

Both backends draft a CASREP from one run and send it to the separate CASREP Board. The field mapping and its gaps are in [CASREP.md](CASREP.md).
`GET /api/health` adds `"casrep": {"url": "http://localhost:8787", "site": "http://localhost:3000", "ready": true, "read": true}`: the board's API, its dashboard for the nav link, whether its Originator key is set here, and whether a read key is set. The key is never sent. A backend without the field has no CASREP routes, and the UI hides the button.
The Cloudflare backend answers these routes with the same shapes, from the D1 audit table, once `CASREP_URL` is set. Its Originator key is the Pages secret `CASREP_KEY`, and its health adds `"drafts": true` and `"passcode": true`. Its `400` says the key is not set on the deployment.
`passcode: true` means a send must carry the owner's send passcode, because that backend is public. The draft's `board` carries the same field.

`GET /api/casrep/draft?query_id=q-0003` builds the draft offline from the audit log:
`{"query_id": "q-0003", "casrep": Casrep, "board": {"url", "ready"}, "sent": null | {"serial", "link", "audit_seq"}}`.
`Casrep` is the board's create body: `serial`, `unit`, `uic`, `report_type`, `category`, `dtg`, `equipment`, `eic`, `description`, `mission_areas`, `parts`, `assistance`, `etr`, `remarks`, `poc_name`, `poc_contact`, `actor_name`.
`422` with a `detail` sentence when the id is not a ddg query, or the log fails verification.

`POST /api/casrep/send`:

```json
{"operator_id": "EOOW-01", "query_id": "q-0003", "category": 3, "mission_areas": ["MOB"], "assistance": "none", "equipment": "SSGTG 2", "poc_name": "GSM2 Rivera"}
```

On a backend whose health says `"passcode": true`, the body also holds `"passcode"`, compared with the `CASREP_SEND_CODE` secret. The laptop ignores the field.

The server rebuilds the draft from the log with these choices, sends it, and appends a `casrep` event signed by the operator:
`{"serial": "N99999/0003", "id": "...", "link": "http://localhost:3000/casrep/?id=...", "casrep": Casrep, "audit": AuditRef}`.
`409` when the run was already sent, `400` when no board key is set, `403` on the cloud when the passcode is wrong or sending is turned off, `502` when the board cannot be reached or refuses, each with a `detail` sentence.
The `casrep` event payload: `summary`, `query_id`, `procedure_id`, `serial`, `casrep_id`, `board`, `link`, `report_type`, `category`.

### Known casualties

Read only, from the local cache of the board. None of these routes waits on the board except `refresh`.
The Cloudflare backend answers them too, from D1, once `CASREP_URL` is set; its health then sends `"casrep": {"url", "site", "ready", "read", "drafts": true}`. The UI hides **Draft CASREP** only when `drafts` is false, on a backend that reads the board but cannot draft.

`POST /api/query` adds `"known_casualties": [KnownCasualty & {"match": "procedure" | "system"}]`: open CASREPs that may be the matched procedure, `procedure` matches first. Empty when nothing matches or no procedure matched.

`GET /api/casreps`:
`{"board": {"url", "site"}, "read": true, "as_of": "2026-11-05T15:58:16+00:00", "age_seconds": 12, "stale": false, "error": null, "last_attempt": "...", "casreps": [KnownCasualty]}`.
`as_of` is the last good pull, or null. `stale` is true with no good pull, a pull older than five minutes, or a failed pull since the last good one; `error` says why.

```ts
type KnownCasualty = {
  id: string; serial: string; unit: string; uic: string;
  status: "open" | "corrected" | "cancelled"; closed_by: "CASCOR" | "CASCAN" | null;
  step: number;              // 0 Originator ... 6 Released
  step_name: string;         // "Originator" | "DIVO" | "DH" | "CHENG" | "XO" | "CO" | "Released"
  step_phrase: string;       // "at DH review", as the banner says it
  report_type: string; category: 2 | 3 | 4; equipment: string; eic: string | null; dtg: string; etr: string | null;
  parts: {nsn: string; nomenclature: string; qty: number}[]; assistance: string; version_no: number;
  last_update: string; last_action: string | null; procedure_ids: string[]; link: string;
};
```

`GET /api/casreps/{id}`: `{"casrep": KnownCasualty, "versions": [...], "events": [...], "as_of", "stale"}`, the board's versions and routing events as cached. `404` when the cache does not hold it.

`POST /api/casreps/refresh` pulls the board now and answers like `GET /api/casreps`. A board that cannot be reached leaves the cache as it was, with `stale` and `error` set.
