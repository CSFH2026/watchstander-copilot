# Agent instructions

## Git and review workflow

- Never commit directly to `main`, except when a human explicitly authorizes a specific change to be committed there.
- Put changes on a focused branch created from `main`. For work not tied to an issue, use `feat/<topic>`, `fix/<topic>`, or `docs/<topic>`.
- When work is tied to a GitHub issue, use GitHub's issue-linked branch format: `<issue-number>-<issue-title>` (for example, `123-fix-audit-verification`). Keep the branch topic recognizable from the issue title. Use GitHub's branch creation flow when available so GitHub associates the branch with the issue.
- Open a pull request for every change unless a human explicitly authorizes a specific direct-to-`main` change. A human must review and approve every pull request before merge. Do not merge your own PR or bypass review.
- For an issue-linked pull request, include a closing reference such as `Closes #123` in the PR description. GitHub will close the issue when the PR is merged.
- Keep the PR focused and describe its purpose, behavior changes, and checks performed. Call out any checks that could not be run.
- Changes to `docs/CONTRACTS.md` require approval from a representative of each side of the affected interface.

## Project purpose and safety boundaries

Watchstander Copilot is offline decision support for the Engineering Officer of the Watch (EOOW). It retrieves cited steps from an authorized procedure corpus and records signed, hash-chained audit events.

- Treat approved procedure text as authoritative. Do not invent, infer, or silently rewrite procedural steps.
- An unmatched or out-of-scope query must return no procedure and no steps; do not fill gaps with generated instructions.
- Keep policy decisions deterministic. A model must not approve or authorize an operator action.
- Keep retrieval separate from action execution. Actions must pass the policy engine's procedure, step, prerequisite, and danger checks.
- Sign and audit both allowed and rejected actions, as well as query responses. Preserve audit-chain verification.
- The EOOW remains responsible for decisions. Make uncertainty and policy rejections clear in the UI.
- Preserve offline operation for the local demo. Do not add runtime network dependencies to its required path.

## Interfaces and data

- Read `docs/CONTRACTS.md` before changing API routes, request/response shapes, procedure data, step states, or audit fields.
- Update the contract before merging a shared interface change. Coordinate changes with affected callers and keep route wiring with the integrator when work is split across pairs.
- Preserve stable `procedure_id` and `step_id` values, exact source text, source labels, step ordering, `requires` links, and `danger` metadata.
- Store procedure data in the format documented in `docs/CONTRACTS.md`. Keep the SQLite index as the local source of truth for procedures, steps, embeddings, and graph edges.
- Keep generated logs, keys, model files, indexes, and other local runtime artifacts out of source control. Check `.gitignore` before adding data.

## Repository map

- `api/`: FastAPI routes, retrieval, policy, signing, and audit verification.
- `cloud/`: Cloudflare implementation; it is not the offline demo target.
- `config/`: runtime and model presets.
- `corpus/`: datasets and procedure sources.
- `ui/`: Sailor UI and typed/voice input.
- `tests/`: contract, scenario, and demo checks.
- `docs/`: architecture, contracts, hosting, and demo guidance.
- `audit/`: local append-only audit logs; generated logs are gitignored.

Read the relevant component README and docs before changing that component. Follow existing patterns and keep changes limited to the requested behavior.

## Build and checks

Use the repository's Makefile as the source of supported commands:

- `make setup` — install dependencies and build the local index.
- `make index` — rebuild the selected dataset's local index.
- `make demo` — build and run the local UI/API demo.
- `make verify` — verify the local audit log hash chain.
- `make test` — run the Python test suite.
- `cd ui && npm run typecheck` — check UI types.
- `cd ui && npm run lint` — lint the UI.
- `cd ui && npm run build` — build the UI.

Run checks relevant to the change when practical. For safety, retrieval, policy, signing, audit, or contract changes, include focused checks for known, unknown, and failure cases. Do not claim an offline result unless the relevant flow was checked with Wi-Fi disabled.

Do not deploy to Cloudflare or change other external services as part of routine development. `make deploy` changes the Cloudflare deployment and requires explicit authorization.

## Documentation

Update the relevant docs when behavior, setup, contracts, safety boundaries, or demo instructions change. Keep `docs/CONTRACTS.md` synchronized with the implemented API and data shapes.
