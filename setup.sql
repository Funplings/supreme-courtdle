-- Drop and recreate to match new schema
DROP TABLE IF EXISTS guesses;

CREATE TABLE guesses (
  id               SERIAL PRIMARY KEY,
  date             TEXT,
  docket           TEXT        NOT NULL,
  player_vote      TEXT,
  justice_correct  INTEGER,
  justice_total    INTEGER,
  elapsed_ms       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guesses_docket_idx ON guesses (docket);
CREATE INDEX IF NOT EXISTS guesses_date_idx   ON guesses (date);
