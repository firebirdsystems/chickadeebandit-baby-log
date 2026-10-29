-- The doctor-visit report (manifest `reports`) and the growth log.
--
-- `local_at` is when the entry started on the HOUSEHOLD's clock, as a floating
-- `YYYY-MM-DDTHH:MM` with no zone. `started_at` stays the instant, in UTC: it
-- is what durations, "2h ago" and the sleep timer are worked out from. The
-- report needs the household's day and time instead, because SQL cannot move
-- a UTC instant into the household's zone, and a feed at 10 pm printed as
-- "03:00 UTC" the next day misleads the doctor reading it. The page writes it
-- beside `started_at` on every insert and edit. Plaintext by suffix. '' on
-- every entry from before this migration (no zone is known here to work it
-- out with); the report falls back to the UTC day and time for those.
ALTER TABLE app_baby_log__entries ADD COLUMN local_at TEXT NOT NULL DEFAULT '';

-- `feed_kind` and `diaper_kind` join db_plaintext_columns in manifest.json, so
-- the daily summary can count wet and dirty diapers, and breast, bottle and
-- solid feeds, in SQL. Ciphertext never compares equal. One-way: entries
-- written before this still hold an encrypted value and cannot be rewritten
-- from SQL (no decrypt in the migration path). Reads are unaffected. The
-- summary leaves a count blank for a day that has such an entry rather than
-- printing a 0 it cannot vouch for.

-- Weight, length and head size, measured at home or at a check-up. Its own
-- table rather than an entry type: the log reads only its latest 400 entries
-- (about four weeks) and expires after two years, and a growth curve needs
-- every measurement for as long as the child is tracked.
--
-- Measures are whole numbers in metric units (grams and millimetres); the page
-- converts for display. Numbers are never encrypted, so the report reads them
-- in SQL. NULL = not measured that time. `measured_date` is the household's
-- calendar day (plaintext by suffix). `note` and `created_by_name` are free
-- text and encrypted. The row policy is the entries one: everyone with the app
-- reads and records under their own stamped name, anyone may correct a
-- measurement, only an adult removes one.
CREATE TABLE IF NOT EXISTS app_baby_log__growth (
  id              TEXT NOT NULL PRIMARY KEY,
  baby_id         TEXT NOT NULL,
  measured_date   TEXT NOT NULL,
  weight_g        INTEGER,
  length_mm       INTEGER,
  head_mm         INTEGER,
  note            TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  visibility      TEXT NOT NULL DEFAULT 'everyone',
  created_at      TEXT NOT NULL,
  FOREIGN KEY (baby_id) REFERENCES app_baby_log__babies(id) ON DELETE CASCADE
);

-- The page's read, the AI export and the report all list measurements by
-- date, newest first; the report also ranges over it.
CREATE INDEX IF NOT EXISTS app_baby_log__growth_date_idx
  ON app_baby_log__growth (measured_date, created_at);

-- One running nap per child, held by the database rather than by a page (the
-- same rule shifts keep, migration 003). Two phones that each see no nap
-- running could both start one, and both would count toward the day's sleep.
-- A second start now fails UNIQUE, and the page reloads to show the nap that
-- is running. "Running" is no end yet; NULL is what the page writes, and ''
-- is included so that a value written some other way still counts.
--
-- A household may already hold two running naps for one child, which would
-- stop the index being built. Every one but the newest is closed at its own
-- start: zero length, so it adds nothing to a sleep total, and the entry
-- itself is kept. Both columns are plaintext (by suffix).
UPDATE app_baby_log__entries
   SET ended_at = started_at
 WHERE entry_type = 'sleep' AND (ended_at IS NULL OR ended_at = '')
   AND EXISTS (
     SELECT 1 FROM app_baby_log__entries AS newer
      WHERE newer.baby_id = app_baby_log__entries.baby_id
        AND newer.entry_type = 'sleep' AND (newer.ended_at IS NULL OR newer.ended_at = '')
        AND (newer.started_at > app_baby_log__entries.started_at
             OR (newer.started_at = app_baby_log__entries.started_at AND newer.id > app_baby_log__entries.id)));

CREATE UNIQUE INDEX IF NOT EXISTS app_baby_log__entries_one_running_sleep_idx
  ON app_baby_log__entries (baby_id) WHERE entry_type = 'sleep' AND (ended_at IS NULL OR ended_at = '');

-- The child's sex, for the growth tab's WHO percentiles: the standards differ
-- for girls and boys. 'female', 'male', or '' when not given, which shows the
-- measurements without percentiles. Encrypted (it is never filtered in SQL);
-- '' is stored as is.
ALTER TABLE app_baby_log__babies ADD COLUMN sex TEXT NOT NULL DEFAULT '';
