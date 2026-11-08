-- One row per page view (the user asked for per-visit usage with location, browser and
-- device, 8 Nov 2026). No IP address and no cookie is stored: `visitor` is a hash of
-- IP + browser + day + a salt that is deleted after two days, so it counts unique
-- visitors within a day but can't be traced back to a person or followed across days.
CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,          -- ms since epoch
  day TEXT NOT NULL,            -- YYYY-MM-DD, India time
  page TEXT NOT NULL,           -- home | greeting
  role TEXT,                    -- on greeting pages: sender | recipient
  visitor TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  timezone TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,                  -- mobile | tablet | desktop
  referrer TEXT,                -- the referring site's host only
  utm_source TEXT,
  lang TEXT,
  screen TEXT                   -- e.g. 390x844
);

CREATE INDEX visits_day ON visits (day);

-- The salt behind `visits.visitor`, one per day, deleted after two days.
CREATE TABLE daily_salt (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
