CREATE TABLE IF NOT EXISTS bot_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telegram_offset INTEGER NOT NULL DEFAULT 0,
  token TEXT,
  minimum TEXT,
  wallet TEXT,
  last_block INTEGER,
  symbol TEXT,
  decimals INTEGER,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS seen_events (
  event_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS seen_events_seen_at_idx ON seen_events (seen_at);

INSERT OR IGNORE INTO bot_state (id, telegram_offset) VALUES (1, 0);
