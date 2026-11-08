-- Which sender's link brought a visit (utm_sender: the "With love" name as a slug).
ALTER TABLE visits ADD COLUMN utm_sender TEXT;

-- Feedback from the end of the greeting page (the user's request, 8 Nov 2026):
-- "If you like this, tell us; we'll build one like it for your business for New Year."
-- Name, business and contact are optional and only stored when someone types them in.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  day TEXT NOT NULL,            -- India time
  message TEXT,
  name TEXT,
  business TEXT,
  contact TEXT,                 -- phone or email, if they want us to get in touch
  role TEXT,                    -- sender | recipient
  country TEXT,
  city TEXT,
  device TEXT,
  utm_sender TEXT
);

CREATE INDEX feedback_at ON feedback (at);
