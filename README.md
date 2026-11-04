# Watchstander Copilot

Trusted Watchstander Copilot for Engineering Plant Casualties.
Fleethacker Norfolk, November 4-6 2026, use case 21.

An offline laptop copilot for the EOOW. It takes a spoken or typed casualty symptom and returns ranked,
source-cited EOCC procedure steps in under 5 seconds. Every response and every operator action is signed
and written to a hash-chained audit log. A policy engine blocks out-of-sequence, dangerous, or unverified steps.

## Layout

| Folder | Lane | Holds |
| --- | --- | --- |
| `api/` | 3, 4 | FastAPI backend: retrieval, policy engine, trust layer, audit log |
| `ui/` | 6 | Sailor UI, push-to-talk voice, typed fallback |
| `corpus/<ship_class>/` | 2 | Procedure markdown files, one folder per ship class |
| `tests/` | 5 | Demo script test cases and the latency sheet |
| `docs/` | 1 | Pitch, submission text, screenshots |
| `audit/` | 4 | `log.jsonl`, append-only, gitignored |

## Run

```bash
make setup   # install api and ui dependencies, pull the local models
make demo    # start api and ui together, offline
make verify  # check the audit log hash chain
```

## Lanes

1. Pitch, submission, and Slack
2. Doctrine and scenarios
3. Retrieval engine and integration (merges every PR)
4. Trust layer and policy engine
5. Test and demo operator
6. Sailor UI and voice

Rules: one branch per lane, PR into `main`, lane 3 merges. `main` always runs `make demo`.
Nobody pushes to `main` after 7:00 PM Thursday.
