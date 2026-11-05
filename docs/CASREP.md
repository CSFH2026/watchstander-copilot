# CASREP export

A Sailor turns a finished copilot run into an INITIAL CASREP and sends it to the CASREP Board, a separate training app (repo `LatentFreedom/casrep`).
The board is not part of this repo; the copilot only writes the board's create body and POSTs it.
The draft is built on the laptop from the signed audit log, so it works offline; only the send needs the network.

## On the screen

After at least one step is acknowledged, the steps panel shows **Draft CASREP**.
The panel shows the CASREP drafted from the run, and the Sailor sets the category, assistance, equipment, point of contact, and mission areas.
**Send to CASREP Board** sends it through the copilot server, which holds the board key, so the key never reaches the browser.
The send is logged as a `casrep` audit entry signed by the operator, and the panel links to the new CASREP on the board.
A run is sent once; opening the panel again shows the CASREP it became.
**Save JSON** downloads the draft, and **Close** sends nothing.
Without a board key on the laptop the panel still drafts and saves, and says the key is missing.
The button needs the local backend; the Cloudflare preset does not have the CASREP routes yet, so it hides the button.

The header's **CASREP Dashboard** link opens the board in its own tab and passes this copilot's address, so the board's **Watchstander Copilot** link comes back here.

The same works with a board on this laptop or the live board: `CASREP_URL` picks it (below).
The copilot server makes the call, so the board's browser CORS rules do not apply.

## From a terminal

```bash
make casrep DRY=1
```

```bash
make casrep QUERY=q-0003 CASREP_ARGS="--category 3"
```

`make casrep` builds the same draft.
It reads `audit/log.jsonl`, checks every hash and signature, and refuses a broken log.
It prints the CASREP and writes it to `audit/casrep-<query id>.json` (gitignored).
`DRY=1` stops there.
Otherwise it asks `Send this CASREP to the board? [y/N]` and sends only on `y`; any other answer leaves the draft file and sends nothing.
On the board the report starts at the Originator step: the Originator submits it up the chain, and a CASCAN dismisses it.

`QUERY` is the query id the screen shows, which is also the id printed on the paper checklist.
Without it, the newest run with at least one acknowledged ddg step is used.
It refuses a run the screen already sent.
A send from the terminal is not written to the audit log, because the running server owns the log's chain.
`CASREP_ARGS` takes `--category 2|3|4`, `--mission-areas MOB,AAW`, `--assistance`, `--equipment`, `--serial`, `--poc-name`, `--url`, `--log`, and `--out`; `scripts/casrep.py --help` lists them.

## Board URL and key

Set these in the environment or in `.casrep.local` at the repo root, one `NAME=value` per line.
That file is gitignored, and the script never prints the key.

| Name | Default | What it is |
|---|---|---|
| `CASREP_URL` | `http://localhost:8787` | the board's API base |
| `CASREP_KEY` | none | the board's Originator role key; only the Originator may open a CASREP |
| `CASREP_ROLE_KEYS` | none | every chain role's key, as JSON in the board's `ROLE_KEYS` form; only `make casrep-examples` uses it |
| `CASREP_READ_KEY` | `CASREP_KEY` | the key the known-casualties pull reads with; any role key reads |
| `CASREP_SITE` | `CASREP_URL` with `:8787` changed to `:3000` | the board's site, for the nav link and the link after a send |
| `CASREP_UNIT` | `USS EXAMPLE (DDG 999)` | unit name, the board's own synthetic ship |
| `CASREP_UIC` | `N99999` | unit identification code |
| `CASREP_POC_CONTACT` | `Main Control, EOOW` | point of contact line |

For the local board, run `npm run dev` in the casrep repo's `worker/` and use its dev Originator key from `worker/.dev.vars`.
For the live board, set `CASREP_URL=https://casrep.latentedge.io` and the live Originator key from the board's owner.
The server reads these at each request, so a change needs no restart.

## Known casualties

The copilot also reads the board, so the watch sees whether a casualty is already reported and where its CASREP stands.
A CASREP is a readiness report, not a live casualty response, so what the copilot shows is context and never a reason to skip a step.

When the matched procedure may already have an open CASREP, a banner sits above the procedure:
"Known casualty: CASREP N99999/0003 is open on SSGTG 2 lube oil system (CAT 2, at DH review). Do the immediate actions, then check whether this matches it."
The steps stay live under it.
**Known casualties** in the header opens a read-only drawer with this ship's open CASREPs and the recently closed ones.
Each row shows the serial, category, report type, chain step (Originator, DIVO, DH, CHENG, XO, CO, Released), equipment, ETR, parts, and last update, and a closed one shows its CASCOR or CASCAN.
Opening one shows its detail and history, with a link out to the board.

The copilot server pulls the board in the background every minute into `api/data/casrep-cache.sqlite`, with the time of the last good pull.
The query, the banner, and the drawer read only that cache, so a slow or missing board never blocks or slows the copilot.
When the board cannot be reached, the copilot works as before, keeps the last copy, and says the data is stale and why.
**Refresh from board** in the drawer pulls at once.
The pull reads with `CASREP_READ_KEY`, else `CASREP_KEY`, and keeps only CASREPs whose UIC is `CASREP_UIC`.

### On the Cloudflare preview

The cloud backend (`cloud/src/casreps.ts`) reads the board the same way, with the same match terms, which `python -m retrieval.export` computes from `api/known.py` into the bundle.
It caches the board in the D1 table `casrep_cache` (migration `0003_casrep_cache.sql`).
A query and the drawer read that table; when the copy is older than a minute, the pull runs after the answer is sent.
The preview reads the board but does not draft or send, so it shows the banner and the drawer and hides **Draft CASREP**.
Without `CASREP_URL` the preview shows neither, as before.

The owner turns it on with two Pages secrets, then a deploy, which also applies the migration:

```bash
cd cloud && npx wrangler pages secret put CASREP_URL --project-name watchstander-copilot-preview
```

```bash
cd cloud && npx wrangler pages secret put CASREP_READ_KEY --project-name watchstander-copilot-preview
```

```bash
WSC_CONFIG=config/cloudflare.yaml make deploy
```

`CASREP_URL` is `https://casrep.latentedge.io`, and the read key is any role key of that board.

### Matching

A CASREP matches the procedure in one of two ways, strongest first:

1. **Procedure**: the CASREP's equipment, description, or remarks names the procedure id. Every CASREP the copilot drafts does.
2. **System**: every word of one part of the procedure's `system:` front matter is in the CASREP's equipment. Parts are split at commas, "and", and parentheses, so "HVAC, chilled water, refrigeration" has three. Both sides expand `corpus/ddg/abbreviations.yaml` first, plurals count as singular, and the words ship, service, main, plant, unit, system, set, and, of, and the do not count.

Only open CASREPs match; a CASCOR or CASCAN takes one off the banner.
Known gaps, from the board's sample data:

- "Air Conditioning Plant 2" does not match the HVAC procedures, because no abbreviation ties A/C to HVAC.
- "JP-5 Transfer Pump 2" does not match the fuel procedures.
- "Fire Pump 3" matches the fire procedures through "fire", although a fire pump belongs to the firemain.
- A CASREP a person wrote matches only by equipment words. A structured field on the board, such as the procedure id or the system, would make that exact (see the proposal in the PR).

## Example CASREPs

`make casrep-examples` loads 12 past casualties of USS EXAMPLE (DDG 999), UIC N99999, into the board at `CASREP_URL`, so the demo tells one ship's story.
Each one comes from a ddg procedure and is drafted with the same builder as **Draft CASREP**, so it reads like a CASREP the copilot sends.
Its remarks say it is a training example and that its query and audit numbers are illustrative, not from a signed audit log.
The script then drives each one to its stage through the board's own API, with each role's key: submit, approve, return, comment, and new versions (UPDATE, CORRECT, CASCOR, CASCAN).
It never writes the board's database, so every example obeys the board's routing rules.

```bash
make casrep-examples DRY=1
```

```bash
make casrep-examples CASREP_ARGS="--role-keys-from ../casrep/worker/.dev.vars --copilot http://127.0.0.1:8000"
```

`DRY=1` prints the examples and their stages and sends nothing.
The load needs a key for each chain role (Originator, Division Officer, Department Head, CHENG, XO, CO).
For the local board, `--role-keys-from` reads them from the board's `worker/.dev.vars`.
Otherwise set `CASREP_ROLE_KEYS` in the environment or `.casrep.local`, as a JSON object of role to key in the same form as the board's `ROLE_KEYS`.
The script never prints a key.
For a board that is not on this laptop it asks `Go ahead? [y/N]` first; `--yes` skips the question.
`--copilot` then asks the running copilot each example's question and the demo questions, and prints which banners show.

Running it again is safe.
Each example has a fixed serial and the marker `wsc-example:ex-NN` in its remarks.
A complete example is skipped, and one that an earlier run left part way is finished from where it stopped.
A serial that holds a CASREP without the marker is refused and left alone.

| Serial | Procedure | Reported | CAT | Type now | Stage | Copilot question that shows it |
|---|---|---|---|---|---|---|
| N99999/0101 | EOCC-SSGTG-HLOT | 27 days ago | 3 | CASCOR | corrected | drawer only: `high lube oil temperature on number one SSGTG, cooler leaking` shows no banner |
| N99999/0102 | EOCC-CRP-HDTK | 24 days ago | 2 | CASCAN | cancelled | drawer only |
| N99999/0103 | EOCC-AC-CHWL | 21 days ago | 4 | UPDATE | CO | `loss of chilled water to electronics cooling, chilled water pump 2 stopped` |
| N99999/0104 | EOCC-GTM-ENCT | 18 days ago | 3 | CASCOR | corrected | drawer only |
| N99999/0105 | EOCC-ELEC-EPCC | 15 days ago | 3 | INITIAL | Released | `EPCC console not responding, displays frozen` |
| N99999/0106 | EOCC-STR-MOTR | 12 days ago | 3 | CORRECT | XO | `steering pump motor 2 stopped, overload alarm` |
| N99999/0107 | EOCC-FUEL-XFER | 10 days ago | 2 | CASCOR | corrected | drawer only |
| N99999/0108 | EOCC-CTL-PACC | 8 days ago | 3 | INITIAL | CHENG | `PACC not responding, programmed control lever has no effect` |
| N99999/0109 | EOCC-AIR-HPAC | 6 days ago | 2 | INITIAL | DH | `HP air compressor 1 will not hold pressure` |
| N99999/0110 | EOCC-REF-HBOX | 4 days ago | 2 | CASCAN | cancelled | drawer only; its question shows 0103 by system |
| N99999/0111 | EOCC-DIST-CAP | 3 days ago | 2 | INITIAL | DIVO | `RO unit 2 output low, product water flow dropping` |
| N99999/0112 | EOCC-LO-PURF | 1 day ago | 2 | INITIAL | Originator | `lube oil purifier stopped, oil in the water discharge` |

The history the board shows:
0101 and 0107 went INITIAL, UPDATE with a new ETR, then CASCOR, each released by the CO.
0103 was released, then got an UPDATE with two parts, outside help, and an earlier ETR, and waits at the CO with comments from the CHENG.
0106 was returned by the Department Head ("Make this CAT 3"), and its CORRECT moved it from CAT 2 to CAT 3.
0102 and 0110 were cancelled before release, and 0105, 0108, and 0109 carry comments.

An open example also shows by system on the other procedures of its system, such as 0103 on every HVAC procedure.
No open example touches the systems of the demo questions: the five example chips and the beat 5 and beat 8 questions in `docs/DEMO.md` (SSGTG, GTM, CRP, fire and flooding, firemain and seawater, main reduction gear and shafting).
So `low lube oil pressure on number two SSGTG` shows no banner until beat 7 sends its own CASREP; `tests/test_seed_casreps.py` checks this.

The board stamps every action with the time of the load, so its Open column and history times say minutes, not weeks.
Only the DTG of each version and the ETR carry the story's dates.

### Between rehearsals

Beat 7 leaves an open LLOP CASREP on the board, and an earlier test send can do the same.
Close it with a CASCAN, released through the chain, so the next run starts clean:

```bash
make casrep-examples CASREP_ARGS="--role-keys-from ../casrep/worker/.dev.vars --cancel N99999/0001"
```

`--reason` sets the CASCAN remark (default "test send from the copilot, not a casualty").
The CASREP then shows under Recently closed in the drawer instead of as a banner.

## What a run is

A run starts at one `query` entry that matched a ddg procedure.
It holds the `action` entries by the same operator for that procedure, up to that operator's next `reset` or next query that lands on the same procedure.
A paper step whose `sheet` is the run's query id belongs to the run whenever it was typed in.
Allowed actions are the actions taken; blocked ones go in the remarks as policy evidence.

## Field mapping

| Board field | Copilot source |
|---|---|
| `report_type` | always `INITIAL`, the only type the board accepts on create |
| `dtg` | the query entry's `ts`, in UTC as `DDHHMMZ MON YY` |
| `equipment` | the procedure's `system` and `title` front matter |
| `description` | the query text, operator and input, the matched procedure, its symptoms, each acknowledged step with its audit seq and paper fields (sheet, time, reading, note), and the steps not yet done |
| `remarks` | the query's audit seq and hash, the step entries, blocked attempts with their reasons, the chain check result, and the procedure source |
| `poc_name`, `actor_name` | the operator id that asked; `--poc-name` for a person's name |
| `serial` | `<UIC>/<query seq, 4 digits>`, moved to the next free number if the board already holds it |

These fields have no source in the copilot and take a training default until someone types them:

| Board field | Default | Why there is no source |
|---|---|---|
| `category` | 2 | mission impact is the commanding officer's call |
| `mission_areas` | `MOB` | every ddg procedure is an engineering casualty; other areas are a judgment |
| `unit`, `uic`, `poc_contact` | the settings above | the copilot does not know the ship |
| `eic`, `parts`, `etr` | empty | the corpus has no EIC, and parts and repair dates come after troubleshooting; add them in an UPDATE on the board |
| `assistance` | `none` | outside help is a decision, not an observation |
