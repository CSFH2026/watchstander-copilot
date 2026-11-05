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
- [Corpus Update Guide](docs/corpus-updates.md)
- [Build Plan](docs/Build-Plan.md)
- [Parallel Work Plan](docs/Parallel-Work-Plan.md)
## Live demo

[Open the cloud test build](https://watchstander-copilot-preview.pages.dev/).
It runs on Cloudflare for frontend work and is not offline; the demo runs on the laptop.
The planned address is watchstander.latentedge.io.

## Layout

| Folder | Holds |
| --- | --- |
| `api/` | FastAPI backend: retrieval, policy engine, trust layer, audit log |
| `cloud/` | The same API on Cloudflare Pages Functions, D1, Vectorize, and Workers AI |
| `config/` | Hoster presets: where the API runs and which model fills each slot |
| `ui/` | Sailor UI, push-to-talk voice, typed fallback |
| `corpus/<dataset>/` | One folder per dataset or ship class, with a `dataset.yaml`; `ddg` (102 DDG-51 casualty procedures, the laptop default) and `wikihow` (stand-in, 2,437 everyday lists) |
| `tests/` | Demo script test cases and the latency sheet |
| `docs/` | Contracts, demo plan, submission text, screenshots |
| `audit/` | `log.jsonl`, append-only, gitignored |

## Run

```bash
make setup   # install api and ui dependencies, pull the local models
make demo    # start api and ui together, offline, on the ddg doctrine; add DATASET=wikihow for the stand-in set
make datasets  # list the datasets you can pick
make verify  # check the audit log hash chain
make run     # start the target that config/local.yaml (or WSC_CONFIG) names
```

To run on Cloudflare instead, see [docs/HOSTING.md](docs/HOSTING.md).

## How we review

Every change goes through a pull request. Nobody pushes to `main` directly.

1. Branch from `main`: `feat/<what>`, `fix/<what>`, or `docs/<what>`.
2. Open a PR. The template asks how you checked it.
3. One person who did not write the change reviews it. They run `make test` and try the change with `make demo`.
4. The reviewer approves, then merges. Nobody merges their own PR.
5. If a PR changes `docs/CONTRACTS.md`, someone from each side of that interface approves it.

GitHub cannot lock `main` on this free private repo, so two checks keep the rule.
On each laptop, a pre-push hook refuses a push to `main`. `make setup` turns it on, and `make hooks` turns it on in an older clone.
On GitHub, the `main-guard` check marks any commit that reaches `main` without a pull request with a red X.
[CONTRIBUTING.md](CONTRIBUTING.md) has the git commands for each step.
`main` always runs `make demo`. Nobody merges to `main` after 7:00 PM Thursday.
