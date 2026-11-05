# Thin wrapper for macOS, Linux, and Git Bash on Windows.
# The demo is one process: FastAPI serves the API under /api and the built UI at /.
ifeq ($(OS),Windows_NT)
PYTHON ?= python
VENV_PY := .venv/Scripts/python.exe
VENV_SCRIPTS := .venv/Scripts
UVICORN := $(VENV_SCRIPTS)/uvicorn.exe
else
PYTHON ?= python3
VENV_PY := .venv/bin/python
VENV_SCRIPTS := .venv/bin
endif
PY := $(VENV_PY)
UVICORN := $(VENV_SCRIPTS)/uvicorn
UV ?= uv
UI_SRC := $(shell find ui/app ui/components ui/lib -type f 2>/dev/null) ui/package.json ui/next.config.js

# DATASET picks the corpus folder for any target, such as make demo DATASET=wikihow. Left empty, the
# config file's dataset: is used (ddg on both presets). make datasets lists the choices.
DATASET ?=
export WSC_DATASET := $(or $(DATASET),$(WSC_DATASET))

.PHONY: setup python-deps ui-deps hooks voice index ui demo dev api-dev ui-dev verify test e2e e2e-cloud fresh-log run deploy bundle datasets casrep casrep-examples

setup: python-deps ui-deps index hooks
	@echo "Setup done. The required embedding model is in api/models/. Copy that folder to the USB stick."

python-deps: .venv/.requirements-installed

.venv/.requirements-installed: api/requirements.txt
	@test -x $(PY) || $(PYTHON) -m venv .venv
	@if command -v $(UV) >/dev/null 2>&1; then \
		$(UV) pip install --python $(PY) -q -r api/requirements.txt; \
	elif $(PYTHON) -m pip install --user -q uv && $(PYTHON) -m uv --version >/dev/null 2>&1; then \
		$(PYTHON) -m uv pip install --python $(PY) -q -r api/requirements.txt; \
	else \
		echo "uv is unavailable; using pip in .venv"; \
		$(PY) -m pip install -q -r api/requirements.txt; \
	fi
	@touch $@

ui-deps: ui/node_modules/.deps-installed

ui/node_modules/.deps-installed: ui/package.json ui/package-lock.json
	cd ui && npm ci && touch node_modules/.deps-installed

# Turns on .githooks/pre-push, which refuses a push to main. Run it once in an older clone.
hooks:
	git config core.hooksPath .githooks

voice:
	$(PY) -m pip install -q -r api/requirements-voice.txt

index:
	cd api && ../$(PY) -m retrieval.indexer $(if $(FORCE),--force)

ui/out/index.html: $(UI_SRC)
	cd ui && npm run build

ui: ui/out/index.html

demo: ui/out/index.html
	@echo "Open http://127.0.0.1:8000  (wifi can be off)"
	cd api && HF_HUB_OFFLINE=1 ../$(UVICORN) main:app --host 127.0.0.1 --port 8000

api-dev:
	cd api && ../$(UVICORN) main:app --host 127.0.0.1 --port 8000 --reload

ui-dev:
	cd ui && NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 npm run dev

dev:
	@echo "API on :8000, UI with hot reload on http://127.0.0.1:3100"
	$(MAKE) -j2 api-dev ui-dev

# No path argument, so the verifier checks the log the server writes: WSC_AUDIT_PATH, else audit/log.jsonl.
verify:
	cd api && ../$(PY) -m trust.verify

test:
	$(PY) -m pytest tests -q

# Browser tests. make e2e starts its own laptop server on port 8099 (E2E_PORT) with a throwaway audit log.
# make e2e-cloud runs the same browser tests and the pytest suite against a deployed backend.
E2E_URL ?= https://watchstander-copilot-preview.pages.dev

e2e/node_modules: e2e/package-lock.json
	cd e2e && npm ci && npx playwright install chromium
	@touch e2e/node_modules

e2e: ui/out/index.html e2e/node_modules
	$(MAKE) index
	cd e2e && npx playwright test

e2e-cloud: e2e/node_modules
	cd e2e && E2E_BASE_URL=$(E2E_URL) npx playwright test
	WSC_BASE_URL=$(E2E_URL) $(PY) -m pytest tests -q

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
	cd api && ../$(PY) -m retrieval.export

datasets:
	@$(PY) scripts/datasets.py

# Drafts a CASREP from one copilot run in the audit log and sends it to the CASREP Board after a y.
# Separate from make demo: only the send needs the network. See docs/CASREP.md.
#   make casrep                       the newest run, to CASREP_URL (default the local board on :8787)
#   make casrep QUERY=q-0003 DRY=1    that run's draft written to audit/, nothing sent
#   make casrep CASREP_ARGS="--category 3 --mission-areas MOB,AAW"
casrep:
	$(PY) scripts/casrep.py $(if $(QUERY),--query $(QUERY)) $(if $(DRY),--dry-run) $(CASREP_ARGS)

# Loads the example CASREPs for USS EXAMPLE (DDG 999) into the board at CASREP_URL, through its API with
# each role's key. Running it again skips what is loaded. See docs/CASREP.md, "Example CASREPs".
#   make casrep-examples DRY=1                 the examples and their stages, nothing sent
#   make casrep-examples CASREP_ARGS="--role-keys-from ../casrep/worker/.dev.vars --copilot http://127.0.0.1:8000"
casrep-examples:
	$(PY) scripts/seed_casreps.py $(if $(DRY),--dry-run) $(CASREP_ARGS)
