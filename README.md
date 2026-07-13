# Baby Log

Feed, diaper, sleep, and pumping log for the newborn/infant phase — quick
one-tap logging, a running sleep timer, and a shared daily summary every
caregiver can see.

- **Storage:** D1 (`app_baby_log__babies`, `app_baby_log__entries`)
- **Access:** both tables `adult_writable` — everyone in the household can read
  the log, only adults (caregivers) can write.
- **Retention:** entries auto-expire after 730 days (`retain_days`), keeping the
  high-volume log bounded.
- **AI:** read-only exports `recent_entries` and `babies`.

## Develop

```bash
make install   # npm install
make dev       # local dev server with demo data
make test      # vitest
make build     # dist/bundle.json
```
