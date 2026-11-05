# Security

This page is the threat model for Watchstander Copilot, what the Nov 5 security review found, what we fixed, and what we accept for the demo and why.
It also gives the design for a real ship.
The review was an automated scan of commit `ad0ca36` with 33 findings.
We checked each one against `main` on Nov 5 and ranked it for our real exposure, not the scan's default severity.

## Three deployments, three threat models

| | Laptop demo (`make demo`) | Public preview (Cloudflare) | A real ship |
| --- | --- | --- | --- |
| Where | One laptop, API on `127.0.0.1:8000`, Wi-Fi off | `watchstander-copilot-preview.pages.dev`, on the public internet | Shipboard network, many consoles |
| Who can call the API | The person at the keyboard, and other processes on that laptop | Anyone with the URL | Any device on the ship's network |
| Data | Public, unclassified EOCC-style training cards; synthetic CASREPs | The same | Controlled procedures and real casualty data |
| Operator identity | Picked from a list; the server holds every operator's key | Picked from a list; Pages secrets hold every key | CAC, with the key on the card |
| Main risk | Low: the attacker is already at the console | Real now: anyone can act as an operator, reset a drill, refresh the board, and fill the audit table | High: forged acknowledgements in a signed record |

The laptop demo is the judged build.
The preview exists so judges and the team can try the app without the laptop.
It has no authentication today; see "Protect the preview" below for the owner steps.

## What the signatures prove today, and what they do not

The audit chain proves that no entry was edited, removed from the middle, or reordered after it was written, unless the editor also holds the signing keys.
The demo shows this: edit one word in `audit/log.jsonl` and verify names the broken entry.

In the demo, the laptop holds every operator's private key in `api/data/keys/`, and the server signs for whichever operator the UI names.
So a signature shows which operator the UI named, not which person clicked.
Whoever controls the laptop can also rewrite and re-sign the whole log.
This is a known demo simplification, not an oversight: `api/trust/keys.py` and `docs/DEMO.md` say that production binds the key to the CAC.

A hash chain alone also cannot show that its newest entries were cut off.
Since PR #116, `make verify` fails on an empty log, but a log cut back to some earlier entry still verifies.
The production answer is a chain head recorded outside the log; see the next section.

## Production design

1. **Sign on the client, with the CAC.**
   The operator's private key never leaves the card.
   The console sends the entry's hash to the card, the card signs it after the PIN, and the server stores the signature.
   The server holds only the node key, for query entries, in a hardware-backed store.
2. **Authenticated operator identity.**
   The server takes the operator from the authenticated session (CAC client certificate or the ship's identity provider), never from a request field.
   `operator_id` in a request body goes away, and `/api/health` stops listing operators.
3. **Anchor the chain head.**
   The node signs the current head (seq and hash) each watch, and the EOOW records it in the CHENG's log, on paper or in a second system.
   Verify then checks that the log still reaches the last recorded head, which catches truncation.
4. **Access in front of any hosted build.**
   Any build reachable over a network sits behind an identity-aware proxy (Cloudflare Access for the hosted twin, the ship's equivalent aboard), with rate limits on the write routes.
5. **One writer for policy and log.**
   The policy check and its audit entry are one transaction: one lock on the laptop (done, PR #118), and on D1 a single statement or batch that re-checks the step before the insert.
6. **Supply chain.**
   Pin GitHub Actions to commit SHAs, install Python packages with `--require-hashes`, and check the embedding model's files against a recorded SHA-256 before use.

## Fixed for Friday

Each PR is small, has tests for the known, unknown, and failure cases, and keeps `make test`, `make e2e`, and `make demo` working.

| PR | Findings | Change |
| --- | --- | --- |
| #116 | `974a425a`, `adcc0048`, `6c5c51b2` | Audit records end at `\n` only, so a query with U+2028 no longer breaks the chain. A damaged last line no longer stops the server. `make verify` fails on an empty log. |
| #117 | `3fb1be7f`, `f9daa22a`, `db2bedb8`, `f21414f8`, `eb5028a6` | Identities and procedure ids are checked before a path is built from them. Key files are created owner-only. |
| #118 | `10fffa64`, `3c69947a` (laptop) | Length limits on every request id field. The policy check and its audit entry are one step. |
| #119 | `8eec673b`, `c43a7952` (laptop) | The CASREP Board key never follows a redirect. CASREP ids are URL-encoded. Refresh cannot fan out. |
| #121 | `b8946e5f`, `ecf82082`, `1dd168f9`, `8eec673b` (cloud) | The cloud twin of #118 and #119, plus 500s that no longer echo error text. Adds `cloud/test` and a CI job. |
| #122 | `3eb58481`, `0ff77306`, `8b35533b`, `02a3b816` | `make e2e-cloud` has no live default. Makefile values are quoted. Test key folders are removed. Workflow output is escaped. |

The cloud fixes reach the preview only when the owner deploys.

## All 33 findings

Verdicts: **confirmed** (true as stated), **partly** (true, but narrower than stated), **false positive**.
"Ours" is the severity for this project, with the deployment it applies to.

| ID | Scan | Finding | Verdict | Ours | Action |
| --- | --- | --- | --- | --- | --- |
| `3f4421e9` | Critical | Server holds and uses every operator key | Confirmed: `api/trust/keys.py` `sign()`, `cloud/src/keys.ts` | Low on the laptop; high for a ship | Accepted for the demo; production design 1 |
| `e4fa429d` | Critical | No auth on `_operator()`; ids listed by `/api/health` | Confirmed: `api/main.py` `_operator()`, `health()` | Low on `127.0.0.1` | Accepted for the demo; production design 2 |
| `4d752b21` | Critical | Same on the cloud action route | Confirmed: `cloud/src/app.ts` `action()` | High on the preview | Owner step: Access |
| `5a77cf56` | Critical | Unauthenticated cloud reset | Confirmed, narrower: it clears one operator's drill and logs a reset; it deletes no audit rows | Medium on the preview | Owner step: Access |
| `3c69947a` | High | Policy check and append not atomic | Partly: a thread race on the laptop; a race across requests on D1 | Low laptop, medium preview | Laptop fixed #118; D1 after the hackathon |
| `a7cfd57c` | High | D1 SQL built by string interpolation | Partly: `sql_str()` in `api/retrieval/export.py` escapes quotes correctly for SQLite; `scripts/run.py` interpolates constants and a hex hash; all deployer input | Low | Accepted; `wrangler d1 execute --command` takes no bind parameters |
| `6c5c51b2` | High | Truncated log passes verify | Partly: true for empty, and for any tail cut, which no hash chain alone can catch | Medium | CLI fixed #116; chain-head anchor in production design 3 |
| `8eec673b` | High | Key forwarded on redirects; ids not encoded | Confirmed: `api/casrep.py` `_call()`, `api/known.py`, `cloud/src/casreps.ts` | Low (the board is our own app) | Fixed #119, #121 |
| `3fb1be7f` | High | Path traversal in `enroll()` | Partly: identities come from config or the local CLI, never a request | Low | Fixed #117 |
| `f9daa22a` | High | Path traversal in `sign()` | Partly: the signer is the node id or a checked operator id | Low | Fixed #117 |
| `db2bedb8` | High | Path traversal in `load_procedure()` | Partly: the id comes from a query entry the server wrote | Low | Fixed #117 |
| `0ff77306` | High | Unquoted `$(QUERY)`, `$(CASREP_ARGS)` | Partly: the person at the laptop types them | Low | `QUERY`, `E2E_URL` fixed #122; `CASREP_ARGS` split on purpose, accepted |
| `8e7af1cd` | Medium | Starlette CVE-2025-62727 (Range DoS) | Confirmed: Starlette 0.41.3 installed | Low on `127.0.0.1`; the cloud has no Python | After the hackathon: upgrade FastAPI and Starlette, then rerun `make test` and `make e2e` |
| `c43a7952` | Medium | Refresh fans out to the board (laptop) | Confirmed | Low | Fixed #119 |
| `1dd168f9` | Medium | Refresh fans out past the Workers subrequest cap | Confirmed | Medium on the preview | Fixed #121; Access |
| `10fffa64` | Medium | No max length on input fields | Partly: `text`, `pick`, paper fields had limits; ids and `input` did not | Low | Fixed #118 |
| `ecf82082` | Medium | Same on the cloud; unmetered Workers AI | Partly: `text` was capped at 500 | Medium on the preview | Fixed #121; the rate needs Access |
| `f88b6756` | Medium | `/api/admin/embed` replay window, no nonce | Confirmed (plus or minus 5 minutes); a replay re-writes the same vectors and needs a captured signed body | Low | Accepted; nonce after the hackathon |
| `1a79e5a0` | Medium | Unbounded audit growth; O(N) verify | Confirmed | Low laptop, medium preview | Access; checkpoints after the hackathon |
| `974a425a` | Medium | U+2028 and U+2029 split records | Confirmed: one query could break the chain | Medium (a demo risk) | Fixed #116 |
| `adcc0048` | Medium | Bad last line crashes startup | Confirmed | Low | Fixed #116 |
| `404dad4e` | Medium | Unauthenticated audit reads on the cloud | Confirmed | Low: training data and typed questions | Accepted for a public demo; Access closes it |
| `b8946e5f` | Medium | Cloud 500s echo raw error text | Confirmed | Low | Fixed #121 |
| `eb5028a6` | Medium | Key files created before `chmod 0600` | Confirmed | Low | Fixed #117 |
| `8b35533b` | Medium | Tests and eval leave `wsc-*` key folders | Confirmed: 130 found on one laptop | Low | Fixed #122 |
| `f21414f8` | Medium | Import writes paths from the CSV `pageid` | Partly: the developer picks the CSV | Low | Fixed #117 |
| `3eb58481` | Medium | `make e2e-cloud` defaults to the live preview | Confirmed, and it happened once on Nov 5 | Medium | Fixed #122 |
| `02a3b816` | Medium | ui-fence echoes raw file names | Partly: read-only token, no secrets, collaborators only | Low | Fixed #122 |
| `e86c4993` | Low | No TrustedHost, dev CORS, no security headers | Partly: CORS allows two `localhost:3100` dev origins only | Low | After the hackathon: TrustedHost for `127.0.0.1` and `localhost` (stops DNS rebinding), headers |
| `8f22bff8` | Low | Model weights not pinned or hash-checked | Confirmed | Low | After the hackathon: production design 6 |
| `ee0cdc1a` | Low | Known-casualty links: no scheme check, no `rel` | Partly: links are built from `CASREP_SITE` and the board's ids, both ours | Low | After the hackathon; `noopener` would stop the named board tab from being reused |
| `28d6556b` | Low | Actions on tags, pip without hashes | Confirmed | Low | After the hackathon: production design 6 |
| `6471698d` | Low | `$PUSHER` in `::error::` | False positive: GitHub user names hold only letters, digits, and hyphens | None | No change |

## Protect the preview (owner steps)

The simplest real protection is Cloudflare Access on the preview host.
It needs no code change and no new secret in the app.
The Zero Trust free plan covers up to 50 users.
These steps change an external service, so the owner runs them.

1. In the Cloudflare dashboard, open **Zero Trust**, then **Access**, then **Applications**, then **Add an application**, then **Self-hosted**.
2. Name it `watchstander-copilot-preview`, and add the domain `watchstander-copilot-preview.pages.dev` with no path.
   Add a second domain `*.watchstander-copilot-preview.pages.dev` for preview deployments.
3. Add a policy **Team**: action **Allow**, include **Emails** with the team's and the judges' addresses.
   Under **Authentication**, keep **One-time PIN**, so no identity provider is needed.
4. Add a second application on `watchstander-copilot-preview.pages.dev` with the path `api/admin/embed` and one policy, action **Bypass**, include **Everyone**.
   `make deploy` posts embed batches there, and each batch is already Ed25519-signed by the node key.
   Do the same for the path `api/health`, which `make deploy` polls while it waits for the deployment.
5. Save, then open the preview in a private window: it should ask for an email and send a PIN.
6. Check that `make deploy` still finishes its embed step.

`E2E_URL=... make e2e-cloud` cannot pass Access as it is.
Run it before you turn Access on, or add a service token later (Access, then **Service Auth**) and send its `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers from the e2e config.

A shared demo key (a Pages secret checked on every write route) is the fallback if Access does not fit.
It needs a code change in `cloud/src/app.ts` and in the UI, and it protects less: the key sits in every visitor's browser.
