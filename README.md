# Baby Log

A [Chickadee Bandit](https://chickadeebandit.com/app-library/baby-log) app.

Feed, diaper, sleep, and pumping log for the newborn/infant phase — quick
one-tap logging, a running sleep timer, and a shared daily summary every
caregiver can see.

- **Storage:** D1 (`app_baby_log__babies`, `app_baby_log__entries`,
  `app_baby_log__shifts`)
- **Access:** `babies` is `adult_writable`. `entries` and `shifts` are
  `owner_or_visibility`: everyone with the app reads and logs under their own
  name (the hub stamps the writer), a nanny or sitter signed in as a household
  guest included; anyone may correct an entry (the parent starts a nap, the
  nanny ends it); only an adult removes one. The hub treats a guest and a
  child alike, so restrict the app for a child if that matters.
- **Shift log:** started, ended, what was done, and a handoff note the next
  person reads first, with hours per person for the week.
- **Retention:** entries and shifts auto-expire after 730 days (`retention`),
  keeping the high-volume log bounded.
- **AI:** read-only exports `recent_entries` and `babies`.

## Develop

```bash
make install   # npm install
make dev       # local dev server with demo data
make test      # vitest
make build     # dist/bundle.json
```
