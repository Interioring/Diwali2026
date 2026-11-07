-- Greetings: only what is needed to render one. No sender data.
CREATE TABLE greetings (
  id TEXT PRIMARY KEY,
  recipient_name TEXT NOT NULL,
  message TEXT NOT NULL,
  style TEXT NOT NULL,
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  reported_at INTEGER
);

CREATE INDEX greetings_expires_at ON greetings (expires_at);

-- Aggregate funnel counters: one row per (day, event). No identifiers.
CREATE TABLE event_counts (
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);

-- Cached Claude-generated wishes per style, reused to control cost.
CREATE TABLE wish_cache (
  style TEXT PRIMARY KEY,
  wishes TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
