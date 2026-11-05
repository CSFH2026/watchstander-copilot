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
