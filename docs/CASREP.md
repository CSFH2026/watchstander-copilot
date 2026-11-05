# CASREP export

`make casrep` turns one copilot run into an INITIAL CASREP and sends it to the CASREP Board, a separate training app (repo `LatentFreedom/casrep`).
The board is not part of this repo; the copilot only writes the board's create body and POSTs it.
The demo stays offline: `make demo` is unchanged, and `make casrep` needs the network only for the send.

## Run it

```bash
make casrep DRY=1
```

```bash
make casrep QUERY=q-0003 CASREP_ARGS="--category 3"
```

The script reads `audit/log.jsonl`, checks every hash and signature, and refuses a broken log.
It prints the CASREP and writes it to `audit/casrep-<query id>.json` (gitignored).
`DRY=1` stops there.
Otherwise it asks `Send this CASREP to the board? [y/N]` and sends only on `y`; any other answer leaves the draft file and sends nothing.
On the board the report starts at the Originator step: the Originator submits it up the chain, and a CASCAN dismisses it.

`QUERY` is the query id the screen shows, which is also the id printed on the paper checklist.
Without it, the newest run with at least one acknowledged ddg step is used.
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

For the local board, run `wrangler dev` in the casrep repo's `worker/` and use its dev Originator key from `worker/.dev.vars`.

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
