# Watchstander Copilot

Trusted Watchstander Copilot for Engineering Plant Casualties.
Fleethacker Norfolk, November 4-6 2026, use case 21.

An offline laptop copilot for the EOOW. It takes a spoken or typed casualty symptom and returns ranked,
source-cited EOCC procedure steps in under 5 seconds. Every response and every operator action is signed
and written to a hash-chained audit log. A policy engine blocks out-of-sequence, dangerous, or unverified steps.

## Documentation

- [Home](docs/Home.md)
- [Architecture](docs/Architecture.md)
- [Demo Guide](docs/Demo-Guide.md)
- [Build Plan](docs/Build-Plan.md)
- [Parallel Work Plan](docs/Parallel-Work-Plan.md)
## Live demo

[Open the cloud test build](https://watchstander-copilot-preview.pages.dev/).
It runs on Cloudflare for frontend work and is not offline; the demo runs on the laptop.
The planned address is watchstander.latentedge.io.

## Layout

| Folder | Lane | Holds |
| --- | --- | --- |
| `api/` | 3, 4 | FastAPI backend: retrieval, policy engine, trust layer, audit log |
| `cloud/` | 3 | The same API on Cloudflare Pages Functions, D1, and Workers AI |
| `config/` | 3 | Hoster presets: where the API runs and which model fills each slot |
| `ui/` | 6 | Sailor UI, push-to-talk voice, typed fallback |
| `corpus/<dataset>/` | 2 | One folder per dataset or ship class, with a `dataset.yaml`; `wikihow` (stand-in, default) and `ddg` (doctrine) |
| `tests/` | 5 | Demo script test cases and the latency sheet |
| `docs/` | 1 | Pitch, submission text, screenshots |
| `audit/` | 4 | `log.jsonl`, append-only, gitignored |

## Run

```bash
make setup   # install api and ui dependencies, pull the local models
make demo    # start api and ui together, offline
make verify  # check the audit log hash chain
make run     # start the target that config/local.yaml (or WSC_CONFIG) names
```

To run on Cloudflare instead, see [docs/HOSTING.md](docs/HOSTING.md).

## Lanes

1. Pitch, submission, and Slack
2. Doctrine and scenarios
3. Retrieval engine and integration (merges every PR)
4. Trust layer and policy engine
5. Test and demo operator
6. Sailor UI and voice

## How we review

Every change goes through a pull request. Nobody pushes to `main` directly.

1. Branch from `main`: `feat/<what>`, `fix/<what>`, or `docs/<what>`.
2. Open a PR. The template asks how you checked it.
3. One person from a different lane reviews it. They run `make test` and try the change with `make demo`.
4. The reviewer approves, then lane 3 merges. Lane 3 asks another coder to review and merge lane 3's own PRs.
5. If a PR changes `docs/CONTRACTS.md`, both lanes on that interface approve it.

GitHub cannot lock `main` on this free private repo, so this is a team rule, not a setting.
`main` always runs `make demo`. Nobody merges to `main` after 7:00 PM Thursday.
