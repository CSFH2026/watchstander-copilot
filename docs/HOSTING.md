# Hosting

One config file picks where the copilot runs and which model fills each slot.
Both targets answer the same API in [CONTRACTS.md](CONTRACTS.md), so the UI works with either.

| Preset | Target | Models | Offline | Use it for |
| --- | --- | --- | --- | --- |
| `config/local.yaml` | FastAPI on the laptop | fastembed bge-small, on the laptop | Yes | The judged demo. This is the default. |
| `config/cloudflare.yaml` | Pages Functions, D1, Workers AI | Workers AI bge-small | No | Frontend work and teammates without the laptop setup. Never the demo. |

Pick a preset with `WSC_CONFIG`, or copy one and edit it.

## Commands

```bash
make run                                       # local target: offline demo on 127.0.0.1:8000
WSC_CONFIG=config/cloudflare.yaml make run     # cloud backend on this machine, port 8788
WSC_CONFIG=config/cloudflare.yaml make deploy  # D1 migrations, then the Pages deploy
```

The cloud `make run` uses a local D1 database and the real Workers AI models, so it needs wifi and a `wrangler login`.
Test there first.
`make deploy` is the only command that changes anything on Cloudflare.

## The config file

| Key | Values | Notes |
| --- | --- | --- |
| `target` | `local`, `cloudflare` | Where the API runs. |
| `models.embed` | `local`, `cloudflare` | Required. A local target may use `cloudflare` to test with cloud vectors; it is then not offline. |
| `models.transcribe`, `rewrite`, `rerank` | `off` for now | The slots exist. Their providers come with issues 21 and 7. |
| `retrieval.*` | numbers | Tuned per embed model. Rerun the off-topic test after any change. |
| `local.*` | host, port | Used by the local target. |
| `cloudflare.*` | Pages project, D1 name | Used by the cloud target. An empty `account_id` means the account wrangler is logged in to. |

The loader refuses a file that cannot work, and names the key to fix.
A cloud target cannot use a `local` model, because a Worker cannot reach a laptop.

## Secrets

Secrets never go in the config file.

| Secret | Where | Made by |
| --- | --- | --- |
| Cloud signing keys | `cloud/.keys/` and `cloud/.dev.vars`, both gitignored | `api/.venv/bin/python scripts/keys_cloud.py` |
| Deployed signing keys | Pages secrets `WSC_KEY_<IDENTITY>` | The commands that `scripts/keys_cloud.py` prints |
| `WSC_CF_AI_TOKEN`, `WSC_CF_ACCOUNT_ID` | Your shell | Only for a local target with `models.embed: cloudflare` |

The cloud keys are separate from the laptop keys in `api/data/keys/`.
Keep `cloud/.keys/`: if it is lost, new keys no longer match the deployed secrets, and both must be set again.

## How the cloud backend stays the same as the laptop

- `api/retrieval/export.py` writes `cloud/data/bundle.json` from the corpus with the laptop's own parser, search text, BM25 statistics, and scope word lists.
- `cloud/src/` holds only the per-question code: tokenize, scope check, BM25 sum, cosine, rank fusion, floors, policy, signing, and the audit chain.
- `WSC_BASE_URL=http://127.0.0.1:8788 make test` runs the same contract tests against the cloud backend.
- `api/.venv/bin/python scripts/cloud_audit.py` exports the cloud audit table and checks it with the laptop verifier. Add `--remote` for the deployed database.

## Domain

The preview deploys to `watchstander-copilot-preview.pages.dev`.
The planned custom domain is `watchstander.latentedge.io`.
The project owner attaches it in the Cloudflare dashboard, under the Pages project, Custom domains.
