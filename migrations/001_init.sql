-- Baby Log — high-frequency daily logging for the newborn/infant phase.
--
-- `babies` holds one row per tracked child (usually one). `entries` is the
-- high-volume log: feeds, diapers, sleep, pumping, and free-form notes.
--
-- Access: both tables are `adult_writable` (manifest.json) — every household
-- member may read (older siblings can check "did the baby eat?"), but only
-- adults (the caregivers) may write. There is no per-row privacy: the whole
-- point is a shared caregiver log.
--
-- `entries` carries `retain_days` (730) so the hub's maintenance runner prunes
-- the log after two years — the data is operational, not archival, and the
-- volume (8-12 feeds/day plus diapers) would otherwise grow unbounded.
--
-- Plaintext columns (manifest db_plaintext_columns): `entry_type` (enum,
-- filtered in SQL / AI exports) and `birth_date` (never sensitive, needed for
-- age math ordering). `started_at`/`ended_at` are `_at`-suffixed and therefore
-- already plaintext, which retain_days and the timeline ORDER BY rely on.
-- Free-text (`name`, `note`, `feed_kind`, `diaper_kind`) stays encrypted; it
-- is only ever displayed, never filtered in SQL.
CREATE TABLE IF NOT EXISTS app_baby_log__babies (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  birth_date TEXT NOT NULL DEFAULT '',   -- ISO YYYY-MM-DD; used for age display
  emoji      TEXT NOT NULL DEFAULT '👶',
  archived   INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_baby_log__entries (
  id         TEXT PRIMARY KEY,
  baby_id    TEXT NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'feed',  -- feed|diaper|sleep|pump|note
  started_at TEXT NOT NULL,                 -- ISO datetime the event began
  ended_at   TEXT,                          -- ISO datetime it ended (sleep/pump); NULL = running
  amount_ml  INTEGER,                       -- bottle/pump volume in ml
  feed_kind  TEXT NOT NULL DEFAULT '',      -- bottle|nurse-left|nurse-right|solids (display only)
  diaper_kind TEXT NOT NULL DEFAULT '',     -- wet|dirty|both (display only)
  note       TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (baby_id) REFERENCES app_baby_log__babies(id) ON DELETE CASCADE
);

-- Hot query: the per-baby timeline, newest first.
CREATE INDEX IF NOT EXISTS app_baby_log__entries_baby_time_idx
  ON app_baby_log__entries (baby_id, started_at);

-- AI export + type-filtered summaries.
CREATE INDEX IF NOT EXISTS app_baby_log__entries_type_idx
  ON app_baby_log__entries (entry_type, started_at);

-- retain_days prunes by started_at; the maintenance DELETE needs a leading
-- started_at index to page expired rows efficiently across all babies.
CREATE INDEX IF NOT EXISTS app_baby_log__entries_started_idx
  ON app_baby_log__entries (started_at);
