<!-- Copied from the data search on 2026-11-04. Paths under raw/ refer to the downloaded originals, which are not in this repo; ask lane 1 for the USB copy. -->
# Watchstander Copilot - public data and doctrine sources

Prepared 2026-11-04 for the Fleethacker Norfolk team (use case 21, Trusted Watchstander Copilot for Engineering Plant Casualties).
Everything here is unclassified and came from the public internet.
Every URL below was opened and the file was inspected before it was listed.
Nothing in this folder is a git repository, and nothing was committed.

## Use first

1. `raw/msc-comscinst-3541-6a/` - COMSCINST 3541.6A, Engineering Casualty Control Exercises (Military Sealift Command, 1986).
   This is the only real, step-formatted casualty control doctrine found in public.
   The diesel section (D-1 to D-20) and electrical section (E-1 to E-11) cover low lube oil pressure, loss of fuel oil pressure, high fresh water cooling temperature, generator hot bearings, and generator overspeed.
   Read `COMSCINST_3541.6A_text.txt` (OCR text); the PDF is a scan.
2. `raw/tpub-navedtra-engineman-1c-ch9/` and `raw/tpub-navedtra-engineman-3-ch11/` - NAVEDTRA Engineman rate training manuals, casualty control and diesel operating chapters, as plain text.
   These give the Navy vocabulary (EOSS, EOCC, split plant, casualty power) and short action lists for diesel casualties.
3. `raw/zenodo-arc-gloria-ship-machinery/` - real 1 Hz diesel generator telemetry (oil pressure, fuel pressure, rpm, fresh water temperature, oil temperature, sea water outlet temperature) from a navy training ship, CC BY 4.0.
   Use the two 200k-row sample CSVs to drive alarm and threshold demos.
   For labeled fault runs with lube oil and cooling water channels use `raw/zenodo-marine-engine-fault/`.

## Real doctrine versus synthetic

- Real doctrine or training text (as published, no edits): everything under `raw/`.
  The text extracts in `raw/tpub-*` and `raw/nsmv-*` are tag-stripped copies of public web pages; wording is unchanged.
- Adapted training copies: the three files in `corpus/ddg/`.
  Each one is built from the MSC exercise cards and the NAVEDTRA chapter named in its front matter, re-sequenced for a DDG ship service diesel generator (SSDG).
  The standby-generator and load-shift steps are synthetic; they follow the generic EOCC pattern and are not from any ship's EOCC card.
  Setpoints in the `symptoms` field (25 psig, 195 F) are illustrative, not from doctrine.
- Synthetic: `corpus/stt/engineering_plant_terms.txt` (curated from the doctrine text) and `corpus/stt/test_utterances.txt` (written for this project).
- No ship-specific EOSS or EOCC card text was found in public, and none should be expected; the Navy does not post them.
  NSTM Chapter 079 Volume 3 (Engineering Casualty Control, 239 pages) is listed on the public NSTM index but is not released to the public.

## Source table

Use column: 1 = doctrine or training text, 2 = alarm or sensor data, 3 = speech or term list.
Local = path under `raw/` where a copy was downloaded.

| # | Name | URL | What it contains | Distribution or license | Size and format | Download command | Use | Local |
|---|------|-----|------------------|-------------------------|-----------------|------------------|-----|-------|
| 1 | COMSCINST 3541.6A Engineering Casualty Control Exercises (MSC, 15 May 1986) | https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf | 83 casualty exercise cards, each with symptoms and causes, action to be taken, and associated casualties. Sections: auxiliaries (A), fire room (B), diesels (D-1 to D-20), electrical (E-1 to E-11), engine room (M), gas turbine (G-1 to G-4), misc. Includes D-14 loss of fuel oil pressure, D-15 low lube oil pressure, D-19 high fresh water cooling temperature, E-3 generator overspeed, E-4 generator hot bearings. | Unclassified; no distribution statement on the document. It was posted on the public msc.navy.mil site and harvested by the 2004 federal web harvest. Treat as public, cite as MSC. | 3.3 MB scanned PDF with OCR layer; OCR text is noisy in the table columns. 2887-line text extract included. | `curl -L -o m35416a.pdf "https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf"` | 1 | `msc-comscinst-3541-6a/` |
| 2 | NAVEDTRA Engineman 1 & C, Chapter 9 Engineering Casualty Control (tpub mirror) | https://www.tpub.com/engine1/en1-183.htm through `en1-197.htm` | Factors in casualty control, communications, ECCET, correction and prevention, split plant, locking main shaft, diesel engine casualties (broken injector tip, broken liner, failed lube oil pressure, water in cylinder), fuel oil casualties, hydraulic coupling, heat exchanger, other propulsion, electrical casualty control, emergency and casualty power. | US Navy rate training manual; US Government work, public domain. Print editions carry Distribution Statement A; the mirror does not show the cover. tpub.com is a commercial mirror. | 15 HTML pages, 70 KB as text. | `for i in $(seq 183 197); do curl -sL -o en1-$i.htm https://www.tpub.com/engine1/en1-$i.htm; done` | 1 | `tpub-navedtra-engineman-1c-ch9/` |
| 3 | NAVEDTRA Engineman 3 (Basic Engine Mechanics), Chapter 11 Diesel Engine Operating Practices (tpub mirror) | https://www.tpub.com/engine3/en32-102.htm through `en32-122.htm` | Engine operational procedures, symptoms of engine trouble, instrument indicators, operating instructions, pressures and temperatures, stopping and securing, emergency diesel generators, factors in casualty control, correction and prevention, safety precautions. | Same as row 2. | 21 HTML pages, 100 KB as text. | `for i in $(seq 102 122); do curl -sL -o en32-$i.htm https://www.tpub.com/engine3/en32-$i.htm; done` | 1, 3 | `tpub-navedtra-engineman-3-ch11/` |
| 4 | NAVEDTRA Fireman, EOSS, EOP and EOCC sections (tpub mirror) | https://www.tpub.com/fireman/10.htm through `13.htm` | Plain-language description of the Engineering Operational Sequencing System, EOP, EOCC, and watch duties. Good for the "what is EOCC" context chunk. | Same as row 2. | 4 HTML pages, 17 KB as text. | `for i in 10 11 12 13; do curl -sL -o fireman-$i.htm https://www.tpub.com/fireman/$i.htm; done` | 1 | `tpub-navedtra-fireman-eoss/` |
| 5 | US Coast Guard Naval Engineering Manual, COMDTINST M9000.6E (21 Oct 2004) | https://webarchive.library.unt.edu/eot2008/20080921153139id_/http://uscg.mil/directives/cim/9000-9999/CIM_9000_6E.pdf | 435 pages. Chapter 079 section J defines the Engineering Casualty Control Manual every cutter must keep: Chapter 1 machinery readiness, Chapter 2 engineering casualties (BECCEs), Chapter 3 general emergency casualties, Chapter 4 damage control. Gives the structure of a casualty manual, not the step text. | "Internet release authorized" on page 1. Superseded by M9000.6G (2020, Change 1; 2022 policy update), which is on dcms.uscg.mil/directives and was not fetched. | 6.4 MB text PDF, 435 pages. | `curl -L -o CIM_9000_6E.pdf "https://webarchive.library.unt.edu/eot2008/20080921153139id_/http://uscg.mil/directives/cim/9000-9999/CIM_9000_6E.pdf"` | 1 | `uscg-naval-engineering-manual-m9000-6e/` |
| 6 | Training Ship Patriot State, Engineering Training Manual, Chapter 8 Casualty Control (Massachusetts Maritime Academy, W. Haynes) | https://whaynes.github.io/NSMV/casualty-control.html | Principles of casualty control, four phases (notification, immediate response, recovery, repair, analysis), watchstander casualty duties. Civilian training ship text with the same vocabulary (low lube oil pressure alarm, secure, start standby, cross-connect). | Public web page, no license stated. Civilian, unclassified. Cite the author; ask before redistributing. | 7 HTML pages, 32 KB as text. | `curl -sL -o casualty-control.html https://whaynes.github.io/NSMV/casualty-control.html` | 1 | `nsmv-patriot-state-training-manual/` |
| 7 | FAS public NSTM index | https://man.fas.org/dod-101/sys/ship/nstm/index.html | Lists all NSTM chapters with page counts and links the ten that are public (001, 075, 096, 320, 420, 583, 588, 593, 613, 772). Chapters 079 V3, 233 (diesel engines), 234 (gas turbines), 262 (lube oil) are listed but not released. | Public reference page. | HTML. | `curl -sL -o nstm-index.html https://man.fas.org/dod-101/sys/ship/nstm/index.html` | 1 (reference only) | not downloaded |
| 8 | UCI Condition Based Maintenance of Naval Propulsion Plants | https://archive.ics.uci.edu/dataset/316/condition+based+maintenance+of+naval+propulsion+plants | 11,934 steady-state rows, 16 gas turbine features (shaft torque, GT and gas generator rpm, compressor and turbine temperatures and pressures, fuel flow) plus compressor and turbine decay coefficients. Simulated CODLAG frigate. | CC BY 4.0, DOI 10.24432/C5K31K. | 567 KB zip; `data.txt` whitespace table, `Features.txt`. | `curl -L -o cbm.zip "https://archive.ics.uci.edu/static/public/316/condition+based+maintenance+of+naval+propulsion+plants.zip"` | 2 | `uci-naval-propulsion-cbm/` |
| 9 | CWRU Bearing Data Center | https://engineering.case.edu/bearingdatacenter/welcome | Motor bearing vibration, 12 kHz and 48 kHz, normal and seeded inner race, ball, outer race faults at 0.007 to 0.040 in, loads 0 to 3 hp. Downloaded: 97 (normal, 0 hp, 1797 rpm), 105 (inner race 0.007 in), 118 (ball 0.007 in), 130 (outer race 0.007 in at 6:00). | No license stated on the site; academic use with citation is the norm. Unclassified. | MATLAB .mat, 2.9 to 3.9 MB each; variables DE, FE, BA, RPM. | `for n in 97 105 118 130; do curl -L -o $n.mat https://engineering.case.edu/sites/default/files/$n.mat; done` | 2 | `cwru-bearing/` |
| 10 | Marine Engine Fault Dataset (Zenodo, Aalto University and NMRI Tokyo, 2026) | https://zenodo.org/records/19857425 | Test-bed marine diesel (Matsui MU323DGSC). Baseline file plus 15 fault runs: air filter clogging, air cooler fouling, injector nozzle clogging, cooling water pump cavitation, turbine degradation. About 115k rows, 70 to 73 channels including lube oil temperature in and out, lube oil pump pressure (raw volts), cooling water temperatures, exhaust temperatures per cylinder, rpm, load. Anomaly flag per row. | CC BY 4.0, DOI 10.5281/zenodo.19857425. | 26.5 MB zip, 102 MB of UTF-8 CSV with a three-row header. | `curl -L -o Marine_Engine_Fault_Data_v1.zip "https://zenodo.org/api/records/19857425/files/Marine_Engine_Fault_Data_v1.zip/content"` | 2 | `zenodo-marine-engine-fault/` |
| 11 | ARC Gloria main machinery sensor dataset (Zenodo, Colombian Navy training ship, Sep to Dec 2025) | https://zenodo.org/records/18330661 | Real 1 Hz telemetry. Generator files: timestamp, oil_pressure_bar, fuel_pressure_bar, generator_speed_rpm, freshwater_temperature_c, oil_temperature_c, seawater_outlet_temperature_c. Main engine file adds six cylinder temperatures. Nominal operation only, with gaps. | CC BY 4.0. | 92 MB zip that expands to 850 MB (three CSVs). The full zip is kept; the extraction was trimmed to the first 200k rows of each generator file (10 MB and 8 MB). | `curl -L -o main_machinery_sensored.zip "https://zenodo.org/api/records/18330661/files/main_machinery_sensored.zip/content"` | 2 | `zenodo-arc-gloria-ship-machinery/` |
| 12 | Predictive Maintenance Engine Data (Hugging Face, Rynaxzion) | https://huggingface.co/datasets/Rynaxzion/predictive-maintenance-engine-data | Tabular rows: engine_rpm, lub_oil_pressure, fuel_pressure, coolant_pressure, lub_oil_temp, coolant_temp, engine_condition (0/1). Generic engine, not marine. Handy for a lube oil pressure threshold demo. | MIT. | 1.0 MB train.csv, 0.26 MB test.csv. | `curl -L -o train.csv https://huggingface.co/datasets/Rynaxzion/predictive-maintenance-engine-data/resolve/main/train.csv` | 2 | `hf-engine-health-tabular/` |
| 13 | Open Speech Repository, American English Harvard sentences | https://www.voiptroubleshooter.com/open_speech/american.html | 25 WAV files, 10 female and 15 male, each about 33 s of ten Harvard sentences. Five downloaded (0010 to 0014). | Free for testing, research, and any reasonable use; must credit "Open Speech Repository". | 8 kHz 16-bit mono WAV, about 0.5 MB each. | `curl -L -o OSR_us_000_0010_8k.wav https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav` | 3 | `open-speech-repository/` |
| 14 | Harvard sentences text list (IEEE 297-1969, Appendix C; Columbia mirror) | http://www.cs.columbia.edu/~hgs/audio/harvard.html | 72 lists of 10 phonetically balanced sentences; the ground truth for row 13. | Published standard list, widely mirrored; the sentences themselves are treated as public. | 38 KB HTML, saved as text. | `curl -L -o harvard.html http://www.cs.columbia.edu/~hgs/audio/harvard.html` | 3 | `open-speech-repository/harvard_sentences_ieee_1969.txt` |
| 15 | LibriSpeech test-clean (OpenSLR 12) | https://www.openslr.org/12 | 5.4 h of read English with transcripts, 40 speakers, 16 kHz FLAC. Standard word-error-rate check for a local speech model. | CC BY 4.0. | 346 MB tar.gz; over the 200 MB limit, not downloaded. | `curl -L -o test-clean.tar.gz https://www.openslr.org/resources/12/test-clean.tar.gz` | 3 | not downloaded |

## What was looked for and not found

- NSTM Chapter 079 Volume 3, 233, 234, 262: listed on the FAS index, not released to the public.
- Official NAVEDTRA PDFs (Fireman 14104A, Engineman, Gas Turbine Systems Technician 14113 and 14114, Electrician's Mate 14344): no live official download found; navybmr.com paths return 404.
  Copies on Scribd and pdfcoffee are unverified uploads and were skipped.
- tpub subdomains that host the Electrician's Mate chapter 14 (electric plant casualties, loss of generator lube oil) and the GSM EOCC section serve a certificate for the wrong host, so they were not fetched.
  The same text may exist on www.tpub.com under another path; worth one browser check.
- NPS or DTIC theses on EOSS or EOCC: none surfaced in three searches.
- A current Coast Guard Naval Engineering Manual (M9000.6G): announced on the Coast Guard directives site, not fetched; the 2004 E edition is here and the ECCM structure in chapter 079 is unchanged in spirit.
- Spam "PDF download" sites (avenza, goodeyes, fordham mirrors) returned by search: ignored.

## Corpus files written

- `corpus/ddg/EOCC-SSDG-LLOP.md` - Low Lube Oil Pressure, SSDG (9 steps; built from MSC D-15 and E-4 plus NAVEDTRA Engineman 1 & C).
- `corpus/ddg/EOCC-SSDG-HJWT.md` - High Jacket Water Temperature, SSDG (9 steps; built from MSC D-19 and D-20).
- `corpus/ddg/EOCC-SSDG-LFOP.md` - Loss of Fuel Oil Pressure, SSDG (9 steps; built from MSC D-14 plus NAVEDTRA fuel oil casualties).
- `corpus/stt/engineering_plant_terms.txt` - 140 plant terms and acronyms for speech-to-text vocabulary tests.
- `corpus/stt/test_utterances.txt` - 20 spoken test sentences that match the three procedures.

Each procedure has a `requires:` on every step and one `danger:` step, in the format the plan asked for.
The front matter adds `status`, `causes`, and `effects` fields that the retriever can ignore.

## Notes for the corpus lane

- The MSC OCR text splits each card into three columns (symptoms and causes, action, associated casualties).
  Read a card against the PDF page once before trusting the column order.
- The MSC cards say "Secure engine immediately" first for low lube oil pressure.
  The corpus files put the load shift before securing, which matches the team's example format; keep both readings in mind when the policy engine judges "out of sequence".
- NAVEDTRA chapter text gives short numbered action lists for propulsion diesels, not generators.
  Where a corpus card needs a generator-specific step, say so in the file's `status` line as these three do.
- Every raw download sits in its own folder; scripts used to fetch and strip text stayed outside `raw/`.
