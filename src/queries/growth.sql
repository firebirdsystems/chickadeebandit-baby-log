-- AI read export: weight, length and head size per child, newest first.
-- Measures are whole grams and millimetres (numbers are never encrypted);
-- measured_date is the household's calendar day (plaintext by suffix).
SELECT
  id,
  baby_id,
  measured_date,
  weight_g,
  length_mm,
  head_mm,
  note
FROM app_baby_log__growth
ORDER BY measured_date DESC
LIMIT 200
