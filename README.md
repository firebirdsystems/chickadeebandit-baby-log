# Baby Log

A [Chickadee Bandit](https://chickadeebandit.com/app-library/baby-log) app.

Feed, diaper, sleep, and pumping log for the newborn/infant phase — quick
one-tap logging, a running sleep timer, and a shared daily summary every
caregiver can see.

- **Storage:** D1 (`app_baby_log__babies`, `app_baby_log__entries`,
  `app_baby_log__shifts`, `app_baby_log__growth`)
- **Access:** `babies` is `adult_writable`. `entries` and `shifts` are
  `owner_or_visibility`: everyone with the app reads and logs under their own
  name (the hub stamps the writer), a nanny or sitter signed in as a household
  guest included; anyone may correct an entry (the parent starts a nap, the
  nanny ends it); only an adult removes one. The hub treats a guest and a
  child alike, so restrict the app for a child if that matters.
- **Growth:** weight, length and head size in grams and millimetres, shown in
  lb/in or kg/cm (per device), with a chart for each. Same row policy as
  `entries`; no retention, since a growth curve needs the first measurement.
- **Report for the pediatrician:** manifest `reports` — a daily summary (feeds,
  breast/bottle/solids, ml, wet/dirty diapers, sleep hours, pumping), every
  entry, and growth, bound by the hub into one document for a date range
  (14 days by default), HTML or PDF. Adults only (the hub refuses guests).
  Days and times are the household's: each entry stores `local_at` beside the
  UTC `started_at` (migration 004). Report queries read the tables directly —
  the governed read refuses a governed table inside a CTE or subquery.
- **Shift log:** started, ended, what was done, and a handoff note the next
  person reads first, with hours per person for the week.
- **Reminders:** manifest `interval_reminders`, sent by the hub's household
  scheduler (the page need not be open): feed (since the last feed started),
  wake window (since the last sleep ended; waits while one runs) and long
  sleep (while one runs, the night included). Each child stores its own wait
  in whole minutes (`feed_interval_min`, `wake_window_min`, `max_nap_min`,
  migration 005); NULL is off, and every child starts off. Adults set them on
  the Reminders tab, which suggests a value for the child's age. While a shift
  is running the reminder goes to whoever is on shift, otherwise to the
  adults; if nothing is logged within 30 minutes the adults are told. The tab
  reads `api/reminders-interval-status` and says so in a shared space, where
  the hub does not send them yet. Needs the `cron` capability.
- **Retention:** entries and shifts auto-expire after 730 days (`retention`),
  keeping the high-volume log bounded.
- **AI:** read-only exports `recent_entries`, `babies` and `growth`.

## Develop

```bash
make install   # npm install
make dev       # local dev server with demo data
make test      # vitest
make build     # dist/bundle.json
```
