-- Dataset content lives in D1 so any dataset size fits: one row per procedure, one row per keyword.
-- api/retrieval/export.py writes cloud/data/seed.sql to fill these. Step vectors live in Vectorize.
-- The vectors table from 0001 is no longer read; drop it in a later migration, after this code is live.
CREATE TABLE IF NOT EXISTS procedures (
  procedure_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  symptoms TEXT NOT NULL,   -- JSON list
  steps TEXT NOT NULL       -- JSON list of {step_id, seq, text, requires, danger}
);

-- BM25 postings: for each term, [step_id, term frequency, step length] per step that holds it.
CREATE TABLE IF NOT EXISTS terms (
  term TEXT NOT NULL,
  part INTEGER NOT NULL,
  idf REAL NOT NULL,
  postings TEXT NOT NULL,
  PRIMARY KEY (term, part)
);

-- corpus_sha256 of the seeded content, and vectors:<index name> once that Vectorize index holds every step.
CREATE TABLE IF NOT EXISTS content_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
