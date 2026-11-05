# Testing

Run the same checks the same way every time.
CI runs all of them on every pull request and on every push to `main`.

| Command | What it checks | Where it runs |
| --- | --- | --- |
| `make test` | The API in Python: config, ddg retrieval, off-topic refusals, the policy engine, audit entries, and paper fields. | CI `backend` job, and your laptop |
| `npm run lint`, `npm run typecheck`, `npm run build` in `ui/` | The web app compiles and builds. | CI `ui` job, and your laptop |
| `make e2e` | The whole app in a real browser, against a laptop server it starts itself. | CI `e2e` job, and your laptop |
| `make e2e-cloud` | The same browser tests, then `make test`'s suite, against the Cloudflare preview. | Your laptop, after a deploy |

## make e2e

`make e2e` builds the UI if it changed, checks the index, and starts the API on port 8099 with a throwaway audit log.
Then Playwright runs `e2e/tests/copilot.spec.ts` in Chromium, one test at a time.
Your demo log in `audit/log.jsonl` is never touched.
If port 8099 is busy, run `E2E_PORT=8098 make e2e`.

The first run installs Playwright and its Chromium into `e2e/node_modules` and your user cache.
After that, a run takes about 15 seconds.
On a failure, open `e2e/report/index.html`: it has a screenshot and a trace of the failed step.

Each test starts the same way: it resets the drill for operator `EOOW-02`, opens the page, and picks that operator.
The questions and answers are fixed in `e2e/tests/fixtures.ts`, so a pass today means the same thing tomorrow.

What the browser tests cover:

- The backend serves ddg (103 procedures, 779 steps), and the top banner says Training only or Cloud test build.
- Every example question finds a procedure, a covered question finds its procedure with all its steps, and an off-topic question is refused.
- Steps are acknowledged in order, and a step out of order is blocked with its reason.
- Verify log says the chain is intact, the log drawer opens, and an entry opens with its proof.
- The printed checklist has every step, the danger text, and the sheet ID (checked with the print styles on, so no print dialog opens).
- Paper results save in order, and a skipped step is blocked.
- The theme toggle works, the showcase page loads, and a phone-width screen has no sideways scroll.
- On the laptop, the app makes no request off the machine.

## make e2e-cloud

Deploy first (see [HOSTING.md](HOSTING.md)), then run `make e2e-cloud`.
`E2E_URL=<url> make e2e-cloud` tests another deployment.
The offline test is skipped on the cloud, because the cloud is online by design.
Known cloud gaps are marked with `test.fixme`, so they show as skipped with the reason, not as a pass.

## Add a test

Add it to `e2e/tests/copilot.spec.ts` with the `app` fixture from `fixtures.ts`.
Wait for an API answer or a visible element, never for a fixed time.
Use a fixed question from `fixtures.ts`, not a random one.
Run it three times before you open the PR: `cd e2e && npx playwright test --repeat-each 3`.

## Still checked by hand

- The real print dialog and a paper printout.
- The demo laptop with wifi off and the USB stick copy.

## Reports from runs by hand

- [2026-11-05, fresh setup and full demo walk on a Mac](test-runs/2026-11-05-local-e2e.md)
