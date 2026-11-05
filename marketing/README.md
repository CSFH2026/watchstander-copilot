# Marketing

Promotional material for this project lives here, not in a central workspace.
`video/` holds the Remotion cuts.
Nothing here is part of the demo, the API, or the UI build.

## The cuts

| Composition | Size | Length | Use |
| --- | --- | --- | --- |
| `watchstander-copilot-commercial` | 1920x1080, 30 fps | about 86 s | Projector backup for the live demo, and later marketing |
| `watchstander-copilot-vertical` | 1080x1920, 30 fps | about 41 s | Social use later |

Both follow the showcase page (`ui/app/showcase/page.tsx`) in order, with its words and numbers.
The app screens are real captures from the running copilot, not drawings.
The CASREP sheet, the whole-loop diagram, and the TRACE mark are drawn from the showcase's own components.

## Render

Render with the shared engine in latentedge-os:

```bash
~/Sites/latentedge-os/organization/departments/growth/tools/remotion-studio.sh <this-repo> render
```

Other commands: `still` (the poster frame of each cut), `studio`, `typecheck`, `lint`, `list`.
Rendered output goes to `video/renders/`, which is gitignored.
How a cut is made: the remotion-commercial skill in latentedge-os.

## Capture the screens again

The screens in `video/public/screens/` come from `video/capture/capture.spec.mts`.
It drives a private copy of the copilot, never the demo server on port 8000: it acknowledges steps, sends a CASREP, and edits its own throwaway log to show a tamper.

1. Build the UI (`cd ui && npm run build`) and the ddg index (`make index`).
2. Start a stand-in board that also accepts one CASREP send, on port 8131.
   `e2e/fake_board.py` serves the reads; the capture needs a `do_POST` that answers 201 with `{"casrep": {"id", "serial"}}`.
3. Start the copilot on port 8130 with a throwaway log and no board sync, so the known casualty appears only when the script asks for it:

   ```bash
   cd api && WSC_CASREP_SYNC=0 HF_HUB_OFFLINE=1 WSC_DATASET=ddg WSC_AUDIT_PATH=/tmp/capture/log.jsonl \
     CASREP_URL=http://127.0.0.1:8131 CASREP_READ_KEY=capture CASREP_KEY=capture \
     .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8130
   ```

4. Link the e2e install and run the phone-width test first, on a fresh cache, then the rest:

   ```bash
   cd marketing/video/capture && ln -s ../../../e2e/node_modules node_modules
   CAPTURE_AUDIT_PATH=/tmp/capture/log.jsonl npx playwright test -g "phone width"
   CAPTURE_AUDIT_PATH=/tmp/capture/log.jsonl npx playwright test -g "copilot screens$"
   ```

The keys above are stand-ins for the stand-in board; no real board key goes near a capture.
The CASREP Board itself asks for a role key, so the cut draws its approval route instead of showing it.
After a new capture, check the ring and focus boxes in `video/Commercial.tsx` and `video/Vertical.tsx`: they are in the screen's CSS px.
