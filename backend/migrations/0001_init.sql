-- Saved designs. params_json holds the user's inputs (base values plus any
-- overrides), not the resolved dimensions, so improved auto rules still apply
-- to values the user didn't pin.
CREATE TABLE designs (
  id           TEXT PRIMARY KEY,      -- 6 random chars, used in ?d= links
  part_type    TEXT NOT NULL,         -- 'bearing' for now
  params_json  TEXT NOT NULL,         -- validated inputs
  params_hash  TEXT NOT NULL,         -- sha-256 of part type + schema + inputs, for dedupe
  schema_ver   INTEGER NOT NULL,      -- so old links survive input changes
  created_at   TEXT NOT NULL,
  downloads    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_designs_created ON designs(created_at);
CREATE UNIQUE INDEX idx_designs_hash ON designs(params_hash);

CREATE TABLE catalog_bearings (
  designation  TEXT PRIMARY KEY,      -- e.g. '608', '6201'
  bore_mm      REAL NOT NULL,
  od_mm        REAL NOT NULL,
  width_mm     REAL NOT NULL,
  notes        TEXT
);

-- Fixed-window counter per client for POST rate limiting. key is a salted
-- hash of the IP, so raw addresses never hit the database.
CREATE TABLE rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,     -- unix seconds, start of the window
  count         INTEGER NOT NULL
);
