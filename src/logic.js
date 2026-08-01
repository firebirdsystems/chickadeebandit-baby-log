/**
 * Pure business logic for the Baby Log app.
 * No DOM, no fetch — importable in both browser and test environments.
 */

export const ENTRY_TYPES = [
  { value: "feed",   label: "Feed",   icon: "🍼" },
  { value: "diaper", label: "Diaper", icon: "🧷" },
  { value: "sleep",  label: "Sleep",  icon: "😴" },
  { value: "pump",   label: "Pump",   icon: "🫙" },
  { value: "note",   label: "Note",   icon: "📝" },
];

const TYPE_BY_VALUE = new Map(ENTRY_TYPES.map((t) => [t.value, t]));

export function typeMeta(type) {
  return TYPE_BY_VALUE.get(type) ?? { value: "note", label: "Note", icon: "📝" };
}

/** "2h 05m" / "45m" / "<1m" from a millisecond duration. Null-safe. */
export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** "just now" / "25m ago" / "3h ago" / "2d ago" for an ISO timestamp. */
export function timeAgo(iso, now = new Date()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.floor((now.getTime() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Local YYYY-MM-DD key for grouping the timeline by day. */
export function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Entries sorted newest first, grouped into [{ key, entries }] by local day. */
export function groupByDay(entries) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.started_at) - new Date(a.started_at),
  );
  const groups = [];
  let cur = null;
  for (const e of sorted) {
    const key = dayKey(e.started_at);
    if (!cur || cur.key !== key) {
      cur = { key, entries: [] };
      groups.push(cur);
    }
    cur.entries.push(e);
  }
  return groups;
}

/**
 * Summary counters for one local day: feed count, last feed, diaper count,
 * total finished sleep ms, plus whether a sleep entry is still running.
 * A running sleep (ended_at null) counts toward the total up to `now`.
 */
export function summarizeDay(entries, key, now = new Date()) {
  const day = entries.filter((e) => dayKey(e.started_at) === key);
  const feeds = day.filter((e) => e.entry_type === "feed");
  const diapers = day.filter((e) => e.entry_type === "diaper");
  let sleepMs = 0;
  let sleeping = false;
  for (const e of day) {
    if (e.entry_type !== "sleep") continue;
    const start = new Date(e.started_at).getTime();
    if (!Number.isFinite(start)) continue;
    if (e.ended_at) {
      const end = new Date(e.ended_at).getTime();
      if (Number.isFinite(end) && end > start) sleepMs += end - start;
    } else {
      sleeping = true;
      if (now.getTime() > start) sleepMs += now.getTime() - start;
    }
  }
  const lastFeed = feeds
    .map((e) => e.started_at)
    .sort()
    .at(-1) ?? null;
  return { feedCount: feeds.length, lastFeedAt: lastFeed, diaperCount: diapers.length, sleepMs, sleeping };
}

/** The currently-running sleep entry for a baby, if any (newest wins). */
export function runningSleep(entries, babyId) {
  return entries
    .filter((e) => e.baby_id === babyId && e.entry_type === "sleep" && !e.ended_at)
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0] ?? null;
}

/** "3 weeks" / "5 months" / "2 years" age label from an ISO birth date. */
export function ageLabel(birthDate, now = new Date()) {
  const b = new Date(`${birthDate}T12:00:00`);
  if (!birthDate || Number.isNaN(b.getTime()) || b > now) return "";
  const days = Math.floor((now - b) / 86400000);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `${Math.floor(days / 7)} weeks`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} months`;
  const years = Math.floor(days / 365.25);
  return `${years} years`;
}

/** One-line detail string for a timeline entry. */
export function entryDetail(e) {
  const bits = [];
  if (e.entry_type === "feed") {
    if (e.feed_kind) bits.push(feedKindLabel(e.feed_kind));
    if (e.amount_ml != null && e.amount_ml !== "") bits.push(`${e.amount_ml} ml`);
  } else if (e.entry_type === "pump") {
    if (e.amount_ml != null && e.amount_ml !== "") bits.push(`${e.amount_ml} ml`);
  } else if (e.entry_type === "diaper") {
    if (e.diaper_kind) bits.push(diaperKindLabel(e.diaper_kind));
  } else if (e.entry_type === "sleep") {
    if (e.ended_at) {
      bits.push(fmtDuration(new Date(e.ended_at) - new Date(e.started_at)));
    } else {
      bits.push("sleeping…");
    }
  }
  return bits.join(" · ");
}

export function feedKindLabel(kind) {
  return {
    "bottle": "Bottle", "nurse-left": "Nursed (L)", "nurse-right": "Nursed (R)", "solids": "Solids",
  }[kind] ?? kind;
}

export function diaperKindLabel(kind) {
  return { "wet": "Wet", "dirty": "Dirty", "both": "Wet + dirty" }[kind] ?? kind;
}

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * The note is where anything unusual gets written ("spat up after the
 * bottle"), and that is what gets looked for later — often to repeat it
 * to a doctor. Entry/feed/diaper kinds are matchable too.
 */
export function searchableFields(item) {
  return [item.note, item.entry_type, item.feed_kind, item.diaper_kind];
}
