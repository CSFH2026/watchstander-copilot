# Portal submission text

Draft for issue #38, Fleethacker Norfolk, use case 21.
Post it in #copilot-general for review, then paste each section into the portal field with the same name.
Every number below was measured on this repo on Nov 4 or Nov 5; the source is named after each one in `docs/DEMO.md`.
Fill in the team name and the member list before you submit.

## Project name

Watchstander Copilot

## Team

[Team name]: [members]

## Use case

21, Trusted Watchstander Copilot for Engineering Plant Casualties.

## One-line summary

An offline laptop copilot that turns a casualty symptom into the cited, ordered EOCC steps in milliseconds, blocks unsafe steps, and signs every action into a tamper-evident log.

## Short description (about 60 words)

At 0200 a low lube oil pressure alarm sounds on No. 2 SSGTG.
The EOOW types what the watch sees, and Watchstander Copilot returns the matching casualty procedure, cited to its source, with the next step marked.
A policy engine blocks steps out of order.
Every query and acknowledgement is signed and hash-chained, so the record of who did what, and when, cannot be changed without detection.
It runs offline on a laptop CPU.

## Problem

In an engineering casualty, the watch has seconds to find the right card in a binder, at night, with alarms sounding.
Doing the steps out of order can drop the bus: the card says never secure the generator (step 05) before the load shifts (step 04).
After the event, a typed log can be edited, and nobody would know.
A general chat model does not fix this.
We asked a local model the same question twice: it took 3 to 12 seconds and gave two different wrong answers, one of them calling it a medical emergency.

## Solution

Watchstander Copilot finds procedures, it does not write them.
No language model is in the answer path, so it cannot invent a step.

- **Find the right card.** Keyword search plus a small local embedding model match the symptom to 102 DDG-51 casualty procedures (771 steps). On 204 watchstander questions it ranks the right procedure first 91.2% of the time and in the top two 98.0% of the time. Server time is 8 to 12 ms.
- **Say when it does not know.** If two procedures fit, it says so and asks the watch to confirm. If no authorized procedure covers the equipment, it says so and points to the EOCC binder. Example: a DDG-51 has no diesel generators, so an SSDG question gets no steps, never a guess.
- **Enforce the order.** Each step lists the steps it requires. Acknowledging step 05 before step 04 is blocked, and the danger note is shown. Prompt injection does nothing, because no model reads the words as commands.
- **Prove the record.** Each acknowledgement is signed with the operator's Ed25519 key, and each answer is signed by the copilot. Each log entry carries the hash of the one before it. Edit one entry and "Verify log" names the broken link.
- **Work where there is no screen.** "Print checklist" gives a paper sheet with each step, its order, its danger note, and room for readings, times, and initials. Results entered from paper go through the same policy engine and are marked as paper in the log.
- **Hand off to the CASREP.** When a casualty cannot be fixed on watch, the copilot drafts a CASREP from the run and, after a yes, sends it to a CASREP Board, where it routes Originator, DIVO, DH, CHENG, XO, CO, then Released.

## Judging criteria

- **Warfighting impact:** the correct procedure and next step in milliseconds, at the moment of a casualty that can take a ship's power.
- **Barrier removal:** answers only from authorized doctrine, refuses what it does not hold, and leaves a record that a reviewer can check.
- **Speed to fleet:** runs offline on a standard laptop CPU with no GPU and no network; installs from a USB stick.
- **Discretion:** no cloud dependency on the ship, no model that can leak or invent content, and every action tied to a signed operator.
- **Scalability:** a new procedure is one reviewed text file with its `requires:` and `danger:` lines, then one index command. The same design takes any ship class: the corpus is one folder per dataset.

## Data

The procedures are training copies built from public, unclassified doctrine: COMSCINST 3541.6A, NAVEDTRA 14111, 14113, and 14114, and the Engineman and Damage Controlman rate manuals.
They are not a ship's EOCC cards.
Each procedure says which steps are taken from the source, adapted, or written to fill a gap.
A ship loads its own approved cards the same way.

## What is next

- Show open CASREPs from the CASREP Board beside the matching procedure, so the watch knows a casualty is already known and being worked.
- Feed closed CASREPs back into the copilot, so the fix that worked last time is part of the next search.
- Bind operator keys to the CAC, and write the chain head into the CHENG's log each watch.

## Links

- Live test build (cloud, not offline): https://watchstander-copilot-preview.pages.dev/
- Walkthrough: https://watchstander-copilot-preview.pages.dev/showcase/
- The judged demo runs offline on the laptop with `make demo`.
