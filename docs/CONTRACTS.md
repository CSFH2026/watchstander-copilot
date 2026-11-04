# Interface contracts

Frozen at kickoff. Any change is posted in `#copilot-dev` and this file is updated before the code merges.

## Corpus file (lane 2 writes, lanes 3 and 4 read)

One markdown file per procedure under `corpus/<ship_class>/`.
Required front matter: `procedure_id`, `title`, `source`, `symptoms`.
Optional: `status`, `causes`, `effects`, `associated` (a list of other procedure ids).

```markdown
---
procedure_id: EOCC-SSDG-LLOP
title: Low Lube Oil Pressure, Ship Service Diesel Generator
source: EOCC Vol 2, Section 4.3 (unclassified training copy)
symptoms: [low lube oil pressure alarm, LO pressure below 25 psig]
---
1. [step: EOCC-SSDG-LLOP-01] Verify alarm at local gauge. requires: none
2. [step: EOCC-SSDG-LLOP-02] Reduce load on affected generator. requires: 01
3. [step: EOCC-SSDG-LLOP-03] Shift electrical load to standby generator. requires: 02
4. [step: EOCC-SSDG-LLOP-04] Secure affected generator. requires: 03. danger: never before 03
```

## Query (UI to retrieval)

```json
POST /query
{"operator_id": "EOOW-01", "text": "low lube oil pressure on 1A generator", "input": "voice"}

200
{"query_id": "q-0012", "latency_ms": 1840,
 "results": [{"rank": 1, "procedure_id": "EOCC-SSDG-LLOP", "step_id": "EOCC-SSDG-LLOP-01",
              "text": "Verify alarm at local gauge", "source": "EOCC Vol 2, 4.3", "score": 0.91}],
 "signature": "base64...", "signer": "copilot-node-01"}
```

## Action (UI to policy engine to audit log)

```json
POST /action
{"operator_id": "EOOW-01", "query_id": "q-0012", "step_id": "EOCC-SSDG-LLOP-04", "action": "execute"}

200
{"allowed": false, "reason": "Step 04 requires step 03 to be acknowledged first",
 "audit_entry": {"seq": 118, "prev_hash": "ab12...", "hash": "cd34...", "signature": "base64..."}}
```

## Audit log (trust layer owns)

Append-only JSON lines in `audit/log.jsonl`. Each line carries `seq`, `ts`, `actor`, `event`,
`payload_hash`, `prev_hash`, `hash`, `signature`.
`python -m trust.verify audit/log.jsonl` prints OK or the first broken `seq`.
