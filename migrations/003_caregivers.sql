-- Everyone who holds the baby logs. Until now only an adult could write an
-- entry, which shut out the person Baby Log is most often opened by: a nanny
-- or a sitter, who signs in as a GUEST of the household and whom the hub
-- treats as a member who is not an adult. This migration is what such a
-- person may write.
--
-- `visibility` is the column the entries row policy reads (owner_or_visibility
-- in manifest.json) so that every member sees every entry. It is always
-- 'everyone' and the manifest lets nobody write it. The hub stamps
-- `created_by` with the caller on every insert and nobody can rewrite it
-- afterwards, so an entry is always the entry of whoever logged it. Anyone
-- who can see an entry may correct it (the parent starts a nap, the nanny
-- ends it); only an adult may remove one.
ALTER TABLE app_baby_log__entries ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone';

-- The name of whoever logged the entry, beside their id. A guest's seat is
-- removed when the job ends and the hub then no longer lists them, so without
-- this every feed a nanny ever logged would read "Someone". '' on every entry
-- from before this migration. Encrypted, as a name is. The id is what the hub
-- stamps and what the policy trusts; this is what the page shows.
ALTER TABLE app_baby_log__entries ADD COLUMN created_by_name TEXT NOT NULL DEFAULT '';

-- The shift log. Arrived, left, what was done, and what the next person should
-- know. Same shape as Elder Care's caregiver shift log, without a profile: a
-- nanny's shift covers every child in the house.
--
-- `started_at` and `ended_at` are instants in UTC, and `ended_at` is '' while
-- the shift is still running. `shift_date` is the HOUSEHOLD's calendar day the
-- shift started on. All three are plaintext by suffix, as is `visibility`
-- (built in). `summary`, `handoff` and `member_name` are free text and
-- encrypted. The hub stamps `member_id` with the caller; the writer may change
-- their own shift, an adult may change or remove any.
CREATE TABLE IF NOT EXISTS app_baby_log__shifts (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL DEFAULT '',
  shift_date TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  handoff TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'everyone',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Serves the launch read, which lists recent shifts newest first.
CREATE INDEX IF NOT EXISTS app_baby_log__shifts_started_at_idx
  ON app_baby_log__shifts (started_at, id);

-- One running shift per person, held by the database rather than by a page:
-- two tabs open before a shift starts each see none running, and without
-- this both inserts land and the hours are counted twice. The second insert
-- now fails UNIQUE, and the page reloads the list to show the one running.
-- Both columns are plaintext by suffix.
CREATE UNIQUE INDEX IF NOT EXISTS app_baby_log__shifts_one_running_idx
  ON app_baby_log__shifts (member_id) WHERE ended_at = '';
