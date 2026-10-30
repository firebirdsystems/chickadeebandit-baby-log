-- AI read export: the most recent baby-log entries, newest first.
-- Single-table projection so it parses under the adult_writable row policy
-- (reads are open to every member, so no member_id is required).
-- started_at/ended_at are plaintext (_at suffix); entry_type is declared in
-- db_plaintext_columns so the ORDER BY/filtering here work in SQL.
-- A temperature is in hundredths of a degree Celsius; a medicine's wait before
-- the next dose (repeat_after_min) is in whole minutes (migration 006).
SELECT
  id,
  baby_id,
  entry_type,
  started_at,
  ended_at,
  amount_ml,
  temp_c100,
  temp_method,
  med_name,
  med_dose,
  repeat_after_min,
  note
FROM app_baby_log__entries
ORDER BY started_at DESC
LIMIT 200
