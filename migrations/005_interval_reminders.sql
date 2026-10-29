-- Reminders: "it's been 3 hours since the last feed". The hub sends them
-- (manifest `interval_reminders`), from the household scheduler: the page
-- never has to be open. Each child carries how long each wait is, in whole
-- minutes, because a wake window is an hour at six weeks and three at a year.
--
-- NULL = that reminder is off, which is what every child starts with: no
-- household gets a push it did not ask for. A parent turns one on from the
-- Reminders tab, which suggests a value for the child's age. The hub honours
-- 1 to 4,320 minutes (72 hours) and ignores anything else. Numbers are never
-- encrypted, so the hub reads them as they are.
--
--   feed_interval_min  since the last feed STARTED
--   wake_window_min    since the last sleep ENDED (waits while one is running)
--   max_nap_min        how long a running sleep may go, the night included
ALTER TABLE app_baby_log__babies ADD COLUMN feed_interval_min INTEGER;
ALTER TABLE app_baby_log__babies ADD COLUMN wake_window_min INTEGER;
ALTER TABLE app_baby_log__babies ADD COLUMN max_nap_min INTEGER;
