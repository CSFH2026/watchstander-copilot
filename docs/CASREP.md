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
| `CASREP_SITE` | `CASREP_URL` with `:8787` changed to `:3000` | the board's site, for the link printed after a send |
| `CASREP_UNIT` | `USS EXAMPLE (DDG 999)` | unit name, the board's own synthetic ship |
| `CASREP_UIC` | `N99999` | unit identification code |
| `CASREP_POC_CONTACT` | `Main Control, EOOW` | point of contact line |

For the local board, run `npm run dev` in the casrep repo's `worker/` and use its dev Originator key from `worker/.dev.vars`.
For the live board, set `CASREP_URL=https://casrep.latentedge.io` and the live Originator key from the board's owner.
The server reads these at each request, so a change needs no restart.

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
