# Thin wrapper so everyone runs the same commands. Mac and Linux.
# The demo is one process: FastAPI serves the API under /api and the built UI at /.
PY := api/.venv/bin/python
UI_SRC := $(shell find ui/app ui/components ui/lib -type f 2>/dev/null) ui/package.json ui/next.config.js

# DATASET picks the corpus folder for any target, such as make demo DATASET=wikihow. Left empty, the
# config file's dataset: is used (ddg on both presets). make datasets lists the choices.
DATASET ?=
export WSC_DATASET := $(or $(DATASET),$(WSC_DATASET))

.PHONY: setup voice index ui demo dev api-dev ui-dev verify test fresh-log run deploy bundle datasets

setup:
	cd api && python3 -m venv .venv && .venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q -r requirements.txt
	cd ui && npm install
	$(MAKE) index
	@echo "Setup done. Models are in api/models/. Copy that folder to the USB stick."

voice:
	cd api && .venv/bin/pip install -q -r requirements-voice.txt

index:
	cd api && .venv/bin/python -m retrieval.indexer

ui/out/index.html: $(UI_SRC)
	cd ui && npm run build

ui: ui/out/index.html

demo: ui/out/index.html
	@echo "Open http://127.0.0.1:8000  (wifi can be off)"
	cd api && HF_HUB_OFFLINE=1 .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

api-dev:
	cd api && .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload

ui-dev:
	cd ui && NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 npm run dev

dev:
	@echo "API on :8000, UI with hot reload on http://127.0.0.1:3100"
	$(MAKE) -j2 api-dev ui-dev

verify:
	cd api && .venv/bin/python -m trust.verify ../audit/log.jsonl

test:
	$(PY) -m pytest tests -q

# Starts a clean chain before a rehearsal or the final demo. The old log is kept, not deleted.
fresh-log:
	@if [ -s audit/log.jsonl ]; then mv audit/log.jsonl audit/log-$$(date +%Y%m%d-%H%M%S).jsonl; echo "old log archived in audit/"; fi

# Hoster entry points. WSC_CONFIG picks the preset (default config/local.yaml); see docs/HOSTING.md.
#   make run                                  local target: the offline demo on 127.0.0.1:8000
#   WSC_CONFIG=config/cloudflare.yaml make run     cloud backend on this machine, port 8788
#   WSC_CONFIG=config/cloudflare.yaml make deploy  migrations, then the Pages deploy
run:
	$(PY) scripts/run.py run

deploy:
	$(PY) scripts/run.py deploy

bundle:
	cd api && .venv/bin/python -m retrieval.export

datasets:
	@$(PY) scripts/datasets.py
