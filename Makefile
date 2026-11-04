.PHONY: setup demo api ui index verify test

setup:
	cd api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
	cd ui && npm install

api:
	cd api && .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

ui:
	cd ui && npm run dev

demo:
	$(MAKE) -j2 api ui

index:
	cd api && .venv/bin/python -m retrieval.indexer ../corpus

verify:
	cd api && .venv/bin/python -m trust.verify ../audit/log.jsonl

test:
	cd api && .venv/bin/python -m pytest ../tests
