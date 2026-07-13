-- AI read export: the tracked children (id ↔ name mapping for recent_entries).
-- adult_writable reads are open, so no member_id is required.
SELECT
  id,
  name,
  birth_date,
  archived
FROM app_baby_log__babies
ORDER BY created_at
LIMIT 50
