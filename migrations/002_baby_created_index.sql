-- babies orders by created_at under LIMIT 50, and the table had no index at all.
CREATE INDEX IF NOT EXISTS app_baby_log__babies_created_idx
  ON app_baby_log__babies(created_at);
