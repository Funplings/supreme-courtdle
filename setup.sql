CREATE TABLE IF NOT EXISTS guesses (
  id         SERIAL PRIMARY KEY,
  date       TEXT        NOT NULL,
  docket     TEXT        NOT NULL,
  guess      TEXT        NOT NULL,
  correct    BOOLEAN     NOT NULL,
  elapsed_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guesses_docket_idx ON guesses (docket);
CREATE INDEX IF NOT EXISTS guesses_date_idx   ON guesses (date);
