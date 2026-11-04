-- The cloud twin of audit/log.jsonl: one row per line, same fields, same hash chain.
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  signer TEXT NOT NULL,
  signature TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_actor ON audit (actor, seq);

-- Step embeddings from Workers AI, keyed by corpus hash and model so a corpus or model change re-embeds.
CREATE TABLE IF NOT EXISTS vectors (
  corpus_sha TEXT NOT NULL,
  model TEXT NOT NULL,
  step_id TEXT NOT NULL,
  vec TEXT NOT NULL,
  PRIMARY KEY (corpus_sha, model, step_id)
);
