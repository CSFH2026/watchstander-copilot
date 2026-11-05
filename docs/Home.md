# Watchstander Copilot

## Purpose

Watchstander Copilot is an offline laptop assistant for the Engineering Officer of the Watch (EOOW). It accepts a typed or spoken engineering casualty symptom and returns ranked, cited steps from the authorized EOCC procedure corpus. The target is a response in under five seconds with Wi-Fi off.

The system is decision support. It does not replace the EOOW, authorize an operation by itself, or invent procedure steps. Every response is signed and recorded in a hash-chained audit log. A deterministic policy engine blocks actions that are unknown, dangerous, or out of sequence.

## Current build

- FastAPI serves the API and the built UI from one local process.
- `POST /api/query` performs hybrid keyword and semantic retrieval, returns cited steps, signs the response, and records it.
- `POST /api/action` checks an operator's acknowledged steps against `requires:` and `danger:` rules before allowing an action; both approvals and rejections are signed and logged.
- SQLite is the shared source of truth for procedures, steps, embeddings, and graph edges.
- The Sailor UI supports typed input, with push-to-talk voice and typed fallback planned through local speech recognition.
- `make setup`, `make demo`, and `make verify` support offline setup, the demo, and audit verification.

See [Architecture](Architecture), [Demo Guide](Demo-Guide), and [Build Plan](Build-Plan).

## Safety and trust properties

1. **Doctrine-only answers:** returned procedure steps come from indexed source rows and include source citations.
2. **Explicit uncertainty:** an unmatched query returns no procedure and no steps; it should not be filled with a generated guess.
3. **Ordered execution:** actions are gated by acknowledged prerequisites and danger rules.
4. **Accountability:** query responses and action results carry a signature and audit reference.
5. **Offline operation:** the required path uses local data and models after setup.

## Repository map

| Path | Purpose |
| --- | --- |
| `api/` | Retrieval, API, policy engine, trust layer, audit verification |
| `ui/` | Sailor UI, voice, typed fallback |
| `corpus/<ship_class>/` | Markdown procedures, separated by ship class |
| `tests/` | Scenario cases and demo checks |
| `docs/` | Contracts, source list, demo plan |
| `audit/` | Local append-only audit log; generated log is gitignored |

## Run locally

```bash
make setup
make demo
make verify
```

The demo must be run with Wi-Fi disabled after model setup to prove the offline path.

