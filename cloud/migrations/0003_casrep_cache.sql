-- The cloud twin of api/data/casrep-cache.sqlite: the last good pull of the CASREP Board, per board URL.
CREATE TABLE IF NOT EXISTS casrep_cache (
  board TEXT PRIMARY KEY,
  as_of TEXT,
  payload TEXT,
  last_attempt TEXT,
  last_error TEXT
);
