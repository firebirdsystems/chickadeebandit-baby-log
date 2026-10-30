/**
 * Pure business logic for the Baby Log app.
 * No DOM, no fetch — importable in both browser and test environments.
 */

import { WHO_LMS } from "./who-growth.js";

export const ENTRY_TYPES = [
  { value: "feed",   label: "Feed",   glyph: "bottle" },
  { value: "diaper", label: "Diaper", glyph: "diaper" },
  { value: "sleep",  label: "Sleep",  glyph: "moon" },
  { value: "pump",   label: "Pump",   glyph: "jar" },
  { value: "temperature", label: "Temperature", glyph: "thermometer" },
  { value: "medicine", label: "Medicine", glyph: "pill" },
  { value: "note",   label: "Note",   glyph: "note" },
];

const TYPE_BY_VALUE = new Map(ENTRY_TYPES.map((t) => [t.value, t]));

export function typeMeta(type) {
  return TYPE_BY_VALUE.get(type) ?? { value: "note", label: "Note", glyph: "note" };
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

/** One-line detail string for a timeline entry; a temperature in `units`. */
export function entryDetail(e, units = "metric") {
  const bits = [];
  if (e.entry_type === "feed") {
    if (e.feed_kind) bits.push(feedKindLabel(e.feed_kind));
    if (e.amount_ml != null && e.amount_ml !== "") bits.push(`${e.amount_ml} ml`);
  } else if (e.entry_type === "pump") {
    if (e.amount_ml != null && e.amount_ml !== "") bits.push(`${e.amount_ml} ml`);
  } else if (e.entry_type === "diaper") {
    if (e.diaper_kind) bits.push(diaperKindLabel(e.diaper_kind));
  } else if (e.entry_type === "temperature") {
    const temp = fmtTemp(e.temp_c100, units);
    if (temp) bits.push(isFever(e.temp_c100, units) ? `${temp}, fever` : temp);
    if (e.temp_method) bits.push(tempMethodLabel(e.temp_method));
  } else if (e.entry_type === "medicine") {
    if (e.med_name) bits.push(e.med_name);
    if (e.med_dose) bits.push(e.med_dose);
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
 * to a doctor. Entry/feed/diaper kinds, and a medicine's name and dose, are
 * matchable too.
 */
export function searchableFields(item) {
  const temps = item.entry_type === "temperature"
    ? [fmtTemp(item.temp_c100, "metric"), fmtTemp(item.temp_c100, "imperial"), isFever(item.temp_c100, "metric") || isFever(item.temp_c100, "imperial") ? "fever" : ""]
    : [];
  return [item.note, item.entry_type, item.feed_kind, item.diaper_kind, item.med_name, item.med_dose, item.temp_method, ...temps];
}

/**
 * The line a failed write shows (app-template CLAUDE.md, "Refused, gone, or
 * failed"): "try again" only when retrying can work. Decided from the
 * status and code the request helper copies onto the Error, never from the
 * hub's text. `gone` is the caller's re-read for a write that changed
 * nothing or met a 409: true = the row is gone, false = a GUARDED write's
 * row is there in another state. An unguarded `WHERE id = ?` write whose row
 * is still there was refused (pass `{ status: 403 }`), and a failed re-read
 * passes no `gone` (the plain retry line).
 */
export function failureLine(e, { action, thing, gone } = {}) {
  if (gone === true) return `This ${thing} has been removed.`;
  if (gone === false) return `This ${thing} was changed by someone else — check it first.`;
  const status = e?.status;
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) {
    return `That ${thing} already exists.`;
  }
  if (status === 403) return `You don’t have permission to ${action}.`;
  if (status === 507) return "The household’s storage is full — free up space first.";
  if (status === 404) return `This ${thing} has been removed.`;
  if (status === 409) return `This ${thing} was changed by someone else — check it first.`;
  return `Couldn’t ${action} — try again.`;
}

/**
 * The line for a plain `WHERE id = ?` write that changed nothing, from the
 * re-read by id that follows it: `gone` true = no row (removed), false = the
 * row is still there, so the row policy narrowed the write away from this
 * member (the permission line), undefined = the re-read failed (try again).
 */
export function unchangedWriteLine(gone, words) {
  if (gone === undefined) return failureLine(null, words);
  return gone ? failureLine(null, { ...words, gone: true }) : failureLine({ status: 403 }, words);
}

/**
 * "Retry after a lost response" (app-template guide): whether a failed
 * write's answer leaves its outcome unknown — no status, a 400, or a 5xx
 * other than 507 — so the page reads the row back by its pinned id. A
 * `UNIQUE_CONSTRAINT` answer is a 400 too: the usual retry of a create that
 * landed collides on its own pinned id. Only finding the row under that id
 * says it landed; not found keeps the "already exists" line.
 */
export function outcomeUnknown(e) {
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return true;
  const status = Number(e?.status) || 0;
  return status === 0 || status === 400 || (status >= 500 && status !== 507);
}

/**
 * Whether a failed write was the database refusing a second running nap for a
 * child (one running nap per child, migration 004): a UNIQUE answer to a
 * write that leaves a nap with no end.
 */
export function runningSleepClash(e, fields) {
  const unique = e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""));
  return unique && fields?.entry_type === "sleep" && !fields?.ended_at;
}

/**
 * The form's fields that differ from the row it opened with, as { column:
 * value }, compared as text with a missing value as empty. With no opened row
 * (no edit), every field.
 */
export function changedFields(opened, fields) {
  if (!opened) return { ...fields };
  return Object.fromEntries(Object.entries(fields).filter(([k, v]) => String(v ?? "") !== String(opened[k] ?? "")));
}

/**
 * Whether a stored row differs from what the form holds now, over the form's
 * own fields only, compared as text with a missing value as empty.
 */
export function storedDiffers(row, fields) {
  return Object.keys(fields).some((k) => String(row?.[k] ?? "") !== String(fields[k] ?? ""));
}

export const SAVED_AS_FIRST = "Saved as first entered — check it and update what changed.";

/* ── Shifts ─────────────────────────────────────────────────────────────────
 * A paid caregiver's shift: started, ended ('' while running), what was done,
 * and a handoff note the next person reads first. Same shape as Elder Care's.
 */

const text = (v) => (v == null ? "" : String(v));

/** Shifts newest first. */
export function sortShifts(rows) {
  return [...rows].sort((a, b) => text(b.started_at).localeCompare(text(a.started_at)) || text(b.id).localeCompare(text(a.id)));
}

/** The shift this member has running, or null. The newest, should there be two. */
export function runningShift(shifts, memberId) {
  if (!memberId) return null;
  return sortShifts(shifts.filter((s) => s.member_id === memberId && !s.ended_at))[0] ?? null;
}

/** Who may change a shift, mirroring the hub: whoever logged it, and any adult. */
export function canEditShift(member, shift, adult) {
  if (!member || !shift) return false;
  return !!adult || (!!member.id && shift.member_id === member.id);
}

/** "2h 15m" / "45m" for an ended shift, in the same format as sleep; "" while it runs or for bad times. */
export function shiftLength(startedAt, endedAt) {
  if (!endedAt) return "";
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  return fmtDuration(ms);
}

/**
 * Why a shift's times cannot be saved, or "". `endedAt` is "" for a shift
 * that is still running and null when the form's end was not a usable time.
 */
export function shiftTimesError(startedAt, endedAt, now = new Date()) {
  if (!startedAt || !Number.isFinite(Date.parse(startedAt))) return "Choose when the shift started.";
  if (Date.parse(startedAt) > now.getTime()) return "A shift cannot start in the future.";
  if (endedAt === null) return "Choose when the shift ended.";
  if (endedAt && Date.parse(endedAt) > now.getTime()) return "A shift cannot end in the future.";
  if (endedAt && endedAt <= startedAt) return "The shift must end after it starts.";
  // Longer than this is a wrong date, not a long day.
  if (endedAt && Date.parse(endedAt) - Date.parse(startedAt) > 48 * 3_600_000) return "A shift cannot be longer than two days. Check the dates.";
  return "";
}

/**
 * The note the next person should read first: the handoff of the most
 * recently ENDED shift that left one. A running shift has not handed anything
 * over yet. null when there is none.
 */
export function latestHandoff(shifts) {
  return [...shifts]
    .filter((s) => s.ended_at && text(s.handoff).trim() !== "")
    .sort((a, b) => text(b.ended_at).localeCompare(text(a.ended_at)) || text(b.id).localeCompare(text(a.id)))[0] ?? null;
}

/**
 * Minutes worked per member over the ended shifts that started in the last
 * `days` days, as [{ member_id, member_name, minutes }] most hours first. A
 * running shift is not counted: its length is not known yet.
 */
export function hoursByMember(shifts, days = 7, now = new Date()) {
  const since = now.getTime() - days * 86_400_000;
  const totals = new Map();
  for (const s of shifts) {
    if (!s.ended_at) continue;
    const start = Date.parse(s.started_at), end = Date.parse(s.ended_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < since) continue;
    const cur = totals.get(s.member_id) ?? { member_id: s.member_id, member_name: s.member_name ?? "", minutes: 0 };
    cur.minutes += Math.round((end - start) / 60_000);
    if (!cur.member_name && s.member_name) cur.member_name = s.member_name;
    totals.set(s.member_id, cur);
  }
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes || text(a.member_id).localeCompare(text(b.member_id)));
}

/* ── Household clock ────────────────────────────────────────────────────────
 * `started_at` is the instant, in UTC. The report needs the household's day
 * and time beside it (migration 004, `local_at`): SQL cannot move an instant
 * into the household's zone.
 */

/**
 * `YYYY-MM-DDTHH:MM` for an instant on the clock of `tz` (an IANA zone), with
 * no zone written: the household's own time. The device's clock when `tz` is
 * missing or unusable, as hub-sdk `hubToday` does. "" for a bad instant.
 */
export function localStamp(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  if (tz) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(d).map((p) => [p.type, p.value]));
      if (parts.year && parts.month && parts.day && parts.hour && parts.minute) {
        return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
      }
    } catch { /* unusable zone — fall through to the device clock */ }
  }
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── Growth ─────────────────────────────────────────────────────────────────
 * Stored as whole grams and millimetres (migration 004); shown in the units
 * the viewer picks.
 */

const GRAMS_PER_LB = 453.59237;
const GRAMS_PER_OZ = 28.349523125;
const MM_PER_IN = 25.4;

/** "imperial" where pounds and inches are what a pediatrician says (the US, Liberia, Myanmar), else "metric". */
export function defaultUnits(locale = "") {
  return /-(US|LR|MM)\b/i.test(String(locale)) ? "imperial" : "metric";
}

/** Whole grams from a form's pounds and ounces, or its kilograms. null when nothing was entered or it is not a number. */
export function gramsFrom({ units, lb = "", oz = "", kg = "" }) {
  if (units === "imperial") {
    if (String(lb).trim() === "" && String(oz).trim() === "") return null;
    const pounds = String(lb).trim() === "" ? 0 : Number(lb);
    const ounces = String(oz).trim() === "" ? 0 : Number(oz);
    if (!Number.isFinite(pounds) || !Number.isFinite(ounces)) return NaN;
    return Math.round(pounds * GRAMS_PER_LB + ounces * GRAMS_PER_OZ);
  }
  if (String(kg).trim() === "") return null;
  const kilos = Number(kg);
  return Number.isFinite(kilos) ? Math.round(kilos * 1000) : NaN;
}

/** Whole millimetres from inches or centimetres. null when empty, NaN when not a number. */
export function mmFrom(value, units) {
  if (String(value ?? "").trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * (units === "imperial" ? MM_PER_IN : 10));
}

/** Pounds and ounces (ounces to one place) for a form, from grams. */
export function lbOz(grams) {
  const totalOz = Math.round((grams / GRAMS_PER_OZ) * 10) / 10;
  const lb = Math.floor(totalOz / 16);
  return { lb, oz: Math.round((totalOz - lb * 16) * 10) / 10 };
}

/** "8 lb 4.2 oz" / "3.75 kg"; "" for no measurement. */
export function fmtWeight(grams, units) {
  if (grams == null || grams === "" || !Number.isFinite(Number(grams))) return "";
  const g = Number(grams);
  if (units === "imperial") {
    const { lb, oz } = lbOz(g);
    return `${lb} lb ${oz} oz`;
  }
  return `${(g / 1000).toFixed(g < 10000 ? 2 : 1)} kg`;
}

/** "21.5 in" / "54.6 cm"; "" for no measurement. */
export function fmtLength(mm, units) {
  if (mm == null || mm === "" || !Number.isFinite(Number(mm))) return "";
  const n = Number(mm);
  return units === "imperial" ? `${(n / MM_PER_IN).toFixed(1)} in` : `${(n / 10).toFixed(1)} cm`;
}

/** The number to put back in a length field, in the form's units. "" for none. */
export function lengthValue(mm, units) {
  if (mm == null || mm === "") return "";
  return units === "imperial" ? String(Math.round((mm / MM_PER_IN) * 10) / 10) : String(Math.round(mm) / 10);
}

// Far outside any baby or toddler: a typo, or the wrong units.
const GROWTH_RANGES = {
  weight_g: [300, 40_000, "weight"],
  length_mm: [200, 1_300, "length"],
  head_mm: [200, 600, "head size"],
};

/**
 * Why a measurement cannot be saved, or "". `fields` holds whole grams and
 * millimetres (null = not measured, NaN = not a number) and the household
 * date it was measured on; `today` is the household's today.
 */
export function growthError(fields, today) {
  if (!isCalendarDate(fields.measured_date)) return "Choose the day it was measured.";
  if (today && fields.measured_date > today) return "A measurement cannot be in the future.";
  const keys = Object.keys(GROWTH_RANGES);
  if (keys.every((k) => fields[k] == null)) return "Enter a weight, a length or a head size.";
  for (const k of keys) {
    const v = fields[k];
    if (v == null) continue;
    const [min, max, label] = GROWTH_RANGES[k];
    if (!Number.isFinite(v)) return `The ${label} is not a number.`;
    if (v < min || v > max) return `That ${label} looks wrong. Check the number and the units.`;
  }
  return "";
}

/** Measurements newest first: by the day measured, then by when they were recorded. */
export function sortGrowth(rows) {
  return [...rows].sort((a, b) => text(b.measured_date).localeCompare(text(a.measured_date))
    || text(b.created_at).localeCompare(text(a.created_at)) || text(b.id).localeCompare(text(a.id)));
}

/** One measure over time, oldest first, as [{ date, value }]; measurements without it are left out. */
export function growthSeries(rows, key) {
  return sortGrowth(rows)
    .reverse()
    .filter((r) => r[key] != null && r[key] !== "" && Number.isFinite(Number(r[key])) && isCalendarDate(r.measured_date))
    .map((r) => ({ date: r.measured_date, value: Number(r[key]) }));
}

/**
 * Chart coordinates for a series inside a `width` × `height` box with `pad`
 * on every side: x by calendar day, y by value, with the range widened a
 * little so a flat line does not sit on the edge. [] for no points.
 */
export function chartPoints(series, width, height, pad = 8) {
  if (!series.length) return [];
  const day = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const xs = series.map((p) => day(p.date));
  const ys = series.map((p) => p.value);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const spread = y1 - y0 || Math.max(1, Math.abs(y1) * 0.1);
  y0 -= spread * 0.1; y1 += spread * 0.1;
  const w = width - pad * 2, h = height - pad * 2;
  return series.map((p, i) => ({
    ...p,
    x: Math.round((pad + (x1 === x0 ? w / 2 : ((xs[i] - x0) / (x1 - x0)) * w)) * 10) / 10,
    y: Math.round((pad + h - ((p.value - y0) / (y1 - y0)) * h) * 10) / 10,
  }));
}

/* ── WHO percentiles ────────────────────────────────────────────────────────
 * From the WHO Child Growth Standards' L, M and S values (who-growth.js), by
 * the child's sex and actual age, birth to 24 months. Shown on the page only:
 * the report is SQL, and a stored percentile would go stale when a birth date
 * or sex is corrected.
 */

const DAYS_PER_MONTH = 365.25 / 12;
// Two calendar years is 731 days across a leap day: still 24 months.
const MAX_STANDARD_DAYS = 731;

/** Whole days from `birthDate` to `date`, both `YYYY-MM-DD`; null when either is not a date. */
export function ageInDays(birthDate, date) {
  if (!isCalendarDate(birthDate) || !isCalendarDate(date)) return null;
  const day = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((day(date) - day(birthDate)) / 86_400_000);
}

/** L, M and S for a measure at an age, interpolated between whole months; null outside birth to 24 months or for an unknown sex. */
export function lmsAt(measure, sex, days) {
  const rows = WHO_LMS[measure]?.[sex];
  if (!rows || days == null || !Number.isFinite(days) || days < 0 || days > MAX_STANDARD_DAYS) return null;
  const months = Math.min(days / DAYS_PER_MONTH, rows.length - 1);
  const i = Math.min(Math.floor(months), rows.length - 2);
  const f = months - i;
  const [a, b] = [rows[i], rows[i + 1]];
  return { L: a[0] + (b[0] - a[0]) * f, M: a[1] + (b[1] - a[1]) * f, S: a[2] + (b[2] - a[2]) * f };
}

/** The measure's value at z standard deviations: M(1 + LSz)^(1/L), or Me^(Sz) when L is 0. */
function valueAtZ({ L, M, S }, z) {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/**
 * The z-score of a value. Past ±3, weight uses WHO's restricted method (the
 * distance in units of the gap between the 2 and 3 SD lines), as WHO's own
 * software does, so an extreme value is not pulled in by the skew.
 */
export function zScore(lms, x) {
  const { L, M, S } = lms;
  const z = L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  if (L === 1 || Math.abs(z) <= 3) return z;
  const sd3 = valueAtZ(lms, 3 * Math.sign(z));
  const sd2 = valueAtZ(lms, 2 * Math.sign(z));
  return 3 * Math.sign(z) + (x - sd3) / Math.abs(sd3 - sd2);
}

/** Standard normal cumulative probability (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Which WHO measure a growth column is, and the factor from its stored unit to the standard's (g → kg, mm → cm). */
export const WHO_MEASURES = {
  weight_g: { measure: "weight", toStandard: 1 / 1000 },
  length_mm: { measure: "length", toStandard: 1 / 10 },
  head_mm: { measure: "head", toStandard: 1 / 10 },
};

/**
 * The percentile (0–100) of a stored measurement for a child, or null when it
 * cannot be placed: no sex, no birth date, older than 24 months, or no value.
 */
export function whoPercentile(column, value, sex, birthDate, measuredDate) {
  const spec = WHO_MEASURES[column];
  if (!spec || value == null || value === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  const lms = lmsAt(spec.measure, sex, ageInDays(birthDate, measuredDate));
  if (!lms) return null;
  return normalCdf(zScore(lms, Number(value) * spec.toStandard)) * 100;
}

/** "48th" / "1st" / "below the 1st" / "above the 99th" for a percentile; "" for none. */
export function percentileLabel(p) {
  if (p == null || !Number.isFinite(p)) return "";
  if (p < 1) return "below the 1st";
  if (p > 99) return "above the 99th";
  const n = Math.round(p);
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix}`;
}

/**
 * The lines drawn behind a growth chart, as US charts for under-2s label them:
 * the 2nd and 98th are WHO's ±2 SD (2.3rd and 97.7th).
 */
export const PERCENTILE_LINES = [
  { label: "2nd", z: -2 }, { label: "5th", z: -1.6449 }, { label: "10th", z: -1.2816 }, { label: "25th", z: -0.6745 },
  { label: "50th", z: 0 }, { label: "75th", z: 0.6745 }, { label: "90th", z: 1.2816 }, { label: "95th", z: 1.6449 }, { label: "98th", z: 2 },
];

/** One percentile line's value, in the STORED unit (grams or millimetres), at each of `days`; null where the standard does not reach. */
export function percentileLine(column, sex, z, days) {
  const spec = WHO_MEASURES[column];
  return days.map((d) => {
    const lms = spec && lmsAt(spec.measure, sex, d);
    return lms ? valueAtZ(lms, z) / spec.toStandard : null;
  });
}

/**
 * A growth chart on an age axis: the child's points, and the percentile lines
 * across the same ages, in a `width` × `height` box with `pad` on each side.
 * `points` are [{ days, value }] in stored units. Returns { dots, lines } with
 * x/y coordinates, or null when the points cannot be placed by age.
 */
export function percentileChart(points, column, sex, width, height, pad = 8) {
  if (!points.length || points.some((p) => p.days == null || p.days < 0 || p.days > MAX_STANDARD_DAYS)) return null;
  let d0 = Math.min(...points.map((p) => p.days));
  let d1 = Math.max(...points.map((p) => p.days));
  // At least a month either side, so a single point sits among the lines.
  if (d1 - d0 < 61) { const mid = (d0 + d1) / 2; d0 = Math.max(0, mid - 30.5); d1 = Math.min(MAX_STANDARD_DAYS, mid + 30.5); }
  const steps = 24;
  const days = Array.from({ length: steps + 1 }, (_, i) => d0 + ((d1 - d0) * i) / steps);
  const raw = PERCENTILE_LINES.map((l) => ({ ...l, values: percentileLine(column, sex, l.z, days) }));
  if (raw.some((l) => l.values.some((v) => v == null))) return null;
  const all = [...points.map((p) => p.value), ...raw.flatMap((l) => l.values)];
  let [y0, y1] = [Math.min(...all), Math.max(...all)];
  const spread = (y1 - y0) || 1;
  y0 -= spread * 0.04; y1 += spread * 0.04;
  const w = width - pad * 2, h = height - pad * 2;
  const x = (d) => Math.round((pad + (d1 === d0 ? w / 2 : ((d - d0) / (d1 - d0)) * w)) * 10) / 10;
  const y = (v) => Math.round((pad + h - ((v - y0) / (y1 - y0)) * h) * 10) / 10;
  return {
    dots: points.map((p) => ({ ...p, x: x(p.days), y: y(p.value) })),
    lines: raw.map((l) => ({ label: l.label, z: l.z, points: days.map((d, i) => ({ x: x(d), y: y(l.values[i]) })) })),
  };
}

/* ── The doctor-visit report ────────────────────────────────────────────────
 * The hub renders the documents (manifest `reports`). The page only chooses
 * the dates and opens them.
 */

export function isCalendarDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  // setUTCFullYear, because Date.UTC reads a year below 100 as 19xx.
  d.setUTCFullYear(year);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * The dates the report covers until someone picks their own: the 14 calendar
 * days ending on `todayStr`, the HOUSEHOLD's today (the days the report is
 * compared with are household days). The hub includes both ends.
 */
export function defaultRecordRange(todayStr) {
  if (!isCalendarDate(todayStr)) return { from: "", to: "" };
  const start = new Date(Date.UTC(Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)) - 1, Number(todayStr.slice(8, 10)) - 13));
  return { from: start.toISOString().slice(0, 10), to: todayStr };
}

/** Why a chosen range cannot be opened, or "". The hub refuses these too, but in a new tab. */
export function recordRangeError(from, to) {
  for (const [label, value] of [["From", from], ["To", to]]) {
    if (value && !isCalendarDate(value)) return `${label} is not a date.`;
  }
  if (from && to && from > to) return "From must not be later than To.";
  return "";
}

/** The address of one document. An empty bound is left off, which the hub reads as open-ended. */
export function recordUrl(reportsUrl, id, format, from, to, base) {
  const url = new URL(`${reportsUrl}/${encodeURIComponent(id)}`, base);
  url.searchParams.set("format", format);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  return url.toString();
}

/* ── Reminders (manifest interval_reminders) ──────────────────────────────── */
// The hub sends these from the household scheduler; the page only stores how
// long each wait is (whole minutes on the child's row, NULL = off) and shows
// when the next one falls due. The rules below are the hub's, restated so the
// page shows the time the hub will act on.

export const REMINDER_KINDS = [
  { id: "feed", column: "feed_interval_min", label: "Feed", what: "since the last feed started" },
  { id: "wake_window", column: "wake_window_min", label: "Wake window", what: "since the last sleep ended" },
  { id: "long_nap", column: "max_nap_min", label: "Long sleep", what: "while a sleep is running. A night’s sleep counts too, so this sends one every night it is on" },
];

/** The hub's bounds: 1 minute to 72 hours. Anything else is off. */
export const MAX_REMINDER_MINUTES = 4320;

/** A child's interval for one kind in whole minutes, or null when it is off. */
export function reminderMinutes(baby, kind) {
  const raw = baby?.[kind.column];
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const minutes = Math.floor(n);
  return minutes >= 1 && minutes <= MAX_REMINDER_MINUTES ? minutes : null;
}

// Wake windows lengthen fast in the first year; feeds space out more slowly.
// [age in days below which, minutes]. A starting point a parent can change,
// never advice: the page says so beside it. Long sleep has none: any value
// fires every night (a night's sleep is a sleep), so a parent picks it on
// purpose or leaves it off.
const SUGGESTED = {
  feed: [[56, 180], [183, 210], [Infinity, 240]],
  wake_window: [[28, 60], [56, 75], [91, 90], [122, 105], [183, 135], [274, 165], [365, 195], [548, 270], [Infinity, 330]],
};
const SUGGESTED_UNKNOWN_AGE = { feed: 180, wake_window: 90 };

/** The value the Reminders tab marks as suggested for the child's age, or null (long sleep). */
export function suggestedMinutes(kindId, birthDate, now = new Date()) {
  if (!SUGGESTED[kindId]) return null;
  const born = new Date(`${birthDate}T12:00:00`);
  if (!birthDate || Number.isNaN(born.getTime()) || born > now) return SUGGESTED_UNKNOWN_AGE[kindId];
  const days = Math.floor((now - born) / 86400000);
  return SUGGESTED[kindId].find(([below]) => days < below)[1];
}

/** "45 min" / "3 h" / "2 h 15 min". */
export function fmtMinutes(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The choices for one kind: quarter hours across the range a family would
 * pick from, plus the stored value and the suggestion when they fall off that
 * grid (a value written some other way is shown, not silently changed).
 */
export function reminderChoices(kindId, ...keep) {
  const [from, to] = kindId === "feed" ? [60, 360] : kindId === "wake_window" ? [30, 420] : [30, 300];
  const set = new Set();
  for (let m = from; m <= to; m += 15) set.add(m);
  for (const m of keep) if (Number.isInteger(m) && m >= 1 && m <= MAX_REMINDER_MINUTES) set.add(m);
  return [...set].sort((a, b) => a - b);
}

// The hub ranks only `toISOString()` instants and ignores any other shape.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** The latest row by `column`, ties by id; rows whose `column` is not an instant are ignored. */
function latestBy(rows, column) {
  let best = null;
  for (const row of rows) {
    if (!INSTANT.test(row[column] ?? "")) continue;
    if (!best || row[column] > best[column] || (row[column] === best[column] && String(row.id) > String(best.id))) best = row;
  }
  return best;
}

/**
 * When each of a child's reminders falls due next, by the hub's rules:
 *   - feed: the latest feed's start, plus the interval.
 *   - wake window: the latest sleep (by when it started). While that sleep is
 *     running there is nothing to wait for; once it ends, its end plus the
 *     interval. An earlier nap added afterwards changes nothing.
 *   - long sleep: only while the latest sleep is running (no end, NULL), its
 *     start plus the interval.
 * Returns [{ kind, minutes, dueAt }] for the reminders that are on and have
 * something to count from, in REMINDER_KINDS order.
 */
export function nextReminders(baby, entries) {
  const own = entries.filter((e) => e.baby_id === baby.id);
  const feed = latestBy(own.filter((e) => e.entry_type === "feed"), "started_at");
  const sleep = latestBy(own.filter((e) => e.entry_type === "sleep"), "started_at");
  // The wake window waits while the latest sleep has no end (NULL or ''); the
  // long-sleep kind counts only a NULL end, as the manifest's
  // running_when { ended_at: null } does.
  const anchors = {
    feed: feed?.started_at,
    wake_window: sleep && INSTANT.test(sleep.ended_at ?? "") ? sleep.ended_at : null,
    long_nap: sleep && sleep.ended_at == null ? sleep.started_at : null,
  };
  const out = [];
  for (const kind of REMINDER_KINDS) {
    const minutes = reminderMinutes(baby, kind);
    if (minutes == null || !anchors[kind.id]) continue;
    out.push({ kind, minutes, dueAt: new Date(new Date(anchors[kind.id]).getTime() + minutes * 60000) });
  }
  return out;
}

/* ── Temperatures and medicines ─────────────────────────────────────────────
 * Two entry types (migration 006). A reading is stored in hundredths of a
 * degree Celsius and shown in the units the viewer picked on the Growth tab
 * (°F with pounds and inches). A medicine is what was given, with how long
 * the label or the doctor said to wait before the next dose.
 */

export const TEMP_METHODS = [
  { value: "rectal", label: "Rectal" },
  { value: "armpit", label: "Armpit" },
  { value: "ear", label: "Ear" },
  { value: "forehead", label: "Forehead" },
  { value: "mouth", label: "Mouth" },
];

export function tempMethodLabel(method) {
  return TEMP_METHODS.find((m) => m.value === method)?.label ?? method;
}

/**
 * Hundredths of a degree Celsius from a form's °F or °C, taken to the tenth a
 * thermometer shows first. That keeps every stored reading on a shown tenth,
 * where the °C and °F fever labels agree (see isFever). null when empty, NaN
 * when not a number.
 */
export function tempC100From(value, units) {
  if (String(value ?? "").trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const tenth = Math.round(n * 10) / 10;
  return Math.round((units === "imperial" ? (tenth - 32) * 5 / 9 : tenth) * 100);
}

function tempNumber(c100, units) {
  const c = Number(c100) / 100;
  return Math.round((units === "imperial" ? c * 9 / 5 + 32 : c) * 10) / 10;
}

/** The number to put back in a temperature field, in the form's units. "" for none. */
export function tempValue(c100, units) {
  if (c100 == null || c100 === "" || !Number.isFinite(Number(c100))) return "";
  return tempNumber(c100, units).toFixed(1);
}

/** "101.2 °F" / "38.4 °C"; "" for none. */
export function fmtTemp(c100, units) {
  const v = tempValue(c100, units);
  return v ? `${v} ${units === "imperial" ? "°F" : "°C"}` : "";
}

/**
 * 38.0 °C (100.4 °F): the reading a fever starts at. A label, never advice.
 * Judged on the tenth shown in `units`, so the label always agrees with the
 * number beside it: 37.97 °C reads "38.0 °C" (a fever) and "100.3 °F" (not).
 * The form only stores readings on a shown tenth (tempC100From), where both
 * agree; the reports, which print both, use the exact bound (manifest,
 * `>= 3800`). Only a reading written some other way can tell them apart.
 */
export const FEVER_C100 = 3800;

export function isFever(c100, units = "metric") {
  if (c100 == null || c100 === "" || !Number.isFinite(Number(c100))) return false;
  return tempNumber(c100, units) >= tempNumber(FEVER_C100, units);
}

/** Why a temperature cannot be saved, or "". Far outside 30–45 °C is a typo or the wrong units. */
export function tempError(c100) {
  if (c100 == null) return "Enter the temperature.";
  if (!Number.isFinite(c100)) return "The temperature is not a number.";
  if (c100 < 3000 || c100 > 4500) return "That temperature looks wrong. Check the number and the units.";
  return "";
}

/** Why a medicine cannot be saved, or "". */
export function medicineError(fields) {
  if (!String(fields.med_name ?? "").trim()) return "Enter the medicine.";
  return "";
}

/** The waits the form offers before the next dose, plus a stored one off the list. */
export function repeatChoices(...keep) {
  const set = new Set([240, 360, 480, 720, 1440]);
  for (const m of keep) if (Number.isInteger(m) && m > 0) set.add(m);
  return [...set].sort((a, b) => a - b);
}

const medKey = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
// A dose or reading's time: any ISO 8601 time with seconds and a zone, the
// rule the mobile widget and Siri read it by too (mobile logic.ts
// zonedInstant). The page writes toISOString(); a row written some other way
// counts only when its time is unambiguous.
// Every field in range, as the widget checks it: no 30 February, no 24:00
// (Date.parse would roll those over to the next day).
const ZONED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:(Z)|([+-])(\d{2}):(\d{2}))$/;
const instantMs = (iso) => {
  const m = typeof iso === "string" ? ZONED.exec(iso) : null;
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const base = Date.UTC(y, mo - 1, d, h, mi, s);
  if (new Date(base).getUTCDate() !== d) return null;
  let offset = 0;
  if (!m[8]) {
    const oh = Number(m[10]), om = Number(m[11]);
    if (oh > 23 || om > 59) return null;
    offset = (oh * 60 + om) * 60000 * (m[9] === "-" ? -1 : 1);
  }
  return base + Number((m[7] ?? "").slice(0, 3).padEnd(3, "0")) - offset;
};

/**
 * A child's medicine doses, newest first; ones with no name or time are left
 * out, and so are ones after `at` (a time typed wrong, or a back-filled dose's
 * later neighbours) when it is given.
 */
function doses(entries, babyId, at = null) {
  const until = at ? at.getTime() : Infinity;
  return entries
    .filter((e) => e.baby_id === babyId && e.entry_type === "medicine" && medKey(e.med_name) && instantMs(e.started_at) != null && instantMs(e.started_at) <= until)
    .sort((a, b) => instantMs(b.started_at) - instantMs(a.started_at) || String(b.id).localeCompare(String(a.id)));
}

/** A stated wait longer than a year is no wait (the mobile widget's rule too). */
export const MAX_WAIT_MIN = 525_600;

/** The wait a dose carries, in whole minutes, or null. */
function repeatOf(e) {
  const n = Number(e.repeat_after_min);
  return e.repeat_after_min != null && e.repeat_after_min !== "" && Number.isInteger(n) && n > 0 && n <= MAX_WAIT_MIN ? n : null;
}

/**
 * The medicines given to a child, newest first, one per name (as typed most
 * recently), with the dose and the wait that last dose carries: a repeat dose
 * is one tap, and the new dose carries its own wait too.
 */
export function recentMedicines(entries, babyId, limit = Infinity, now = new Date()) {
  const out = new Map();
  // Up to now, as the log's "not again before": a dose dated ahead by mistake is not the last one given.
  for (const e of doses(entries, babyId, now)) {
    const key = medKey(e.med_name);
    if (!out.has(key)) out.set(key, { med_name: e.med_name.trim(), med_dose: e.med_dose ?? "", repeat_after_min: repeatOf(e) });
  }
  return [...out.values()].slice(0, limit);
}

/** The medicine named among `recentMedicines`, matched as the log matches names, or null. */
export function knownMedicine(meds, name) {
  const key = medKey(name);
  return key ? meds.find((m) => medKey(m.med_name) === key) ?? null : null;
}

/**
 * For each medicine whose next dose is still waited for: the last dose and the
 * time before which not to give it again — that dose plus the wait it carries.
 * A dose logged with no wait has none: the form fills in the medicine's last
 * wait, so a dose only lacks one when the caregiver cleared it. Soonest first.
 */
export function nextDoses(entries, babyId, now = new Date()) {
  const last = new Map();
  for (const e of doses(entries, babyId, now)) {
    const key = medKey(e.med_name);
    if (!last.has(key)) last.set(key, e);
  }
  const out = [];
  for (const e of last.values()) {
    const wait = repeatOf(e);
    if (wait == null) continue;
    const notBefore = new Date(instantMs(e.started_at) + wait * 60000);
    if (notBefore > now) out.push({ name: e.med_name.trim(), dose: e.med_dose ?? "", givenAt: e.started_at, notBefore });
  }
  return out.sort((a, b) => a.notBefore - b.notBefore);
}

/**
 * The logged dose of the medicine named that a dose given `at` would come too
 * close to, either side of `at`: a dose back-filled for this morning, or one
 * logged on another phone a minute after the form was opened, both count. A
 * dose at or before `at` is judged on its own wait; one after it, on the wait
 * chosen for the new dose (`chosen`, minutes), or its own when none was: the
 * form's time is to the minute, so a dose logged seconds after it opened
 * comes after it. Only the doses either side count — those at the last time
 * at or before `at` and at the first time after it — never an older one. The nearer, as
 * { id, name, dose, givenAt, notBefore }; null when none. `excludeId` is the dose
 * being saved, when an earlier try may already have stored it.
 */
export function doseWait(entries, babyId, name, at = new Date(), chosen = null, excludeId = null) {
  return doseWaits(entries, babyId, name, at, chosen, excludeId)[0] ?? null;
}

/** Every dose `doseWait` judges too close — those either side of `at` — nearest first. */
export function doseWaits(entries, babyId, name, at = new Date(), chosen = null, excludeId = null) {
  const key = medKey(name);
  if (!key) return [];
  const pick = Number.isInteger(chosen) && chosen > 0 && chosen <= MAX_WAIT_MIN ? chosen : null;
  const atMs = at.getTime();
  const same = doses(entries, babyId).filter((e) => medKey(e.med_name) === key && (excludeId == null || e.id !== excludeId));
  // The last time at or before `at`, and the first after it — every dose at
  // either: two caregivers logging in the same minute are two doses.
  const times = same.map((e) => instantMs(e.started_at));
  const tBefore = Math.max(...times.filter((t) => t <= atMs));
  const tAfter = Math.min(...times.filter((t) => t > atMs));
  const near = [];
  for (const e of same) {
    const t = instantMs(e.started_at);
    if (t !== tBefore && t !== tAfter) continue;
    const wait = t <= atMs ? repeatOf(e) : pick ?? repeatOf(e);
    const gap = Math.abs(t - atMs);
    if (wait != null && gap < wait * 60000) near.push({ e, gap, wait });
  }
  return near.sort((a, b) => a.gap - b.gap).map(({ e, wait }) =>
    ({ id: e.id, name: e.med_name.trim(), dose: e.med_dose ?? "", givenAt: e.started_at, notBefore: new Date(instantMs(e.started_at) + wait * 60000) }));
}

/** The child's latest temperature taken within `hours` before `now`, ties by id, or null. */
export function latestTemperature(entries, babyId, now = new Date(), hours = TEMPERATURE_HOURS) {
  let best = null;
  for (const e of entries) {
    if (e.baby_id !== babyId || e.entry_type !== "temperature" || e.temp_c100 == null || e.temp_c100 === "") continue;
    const t = instantMs(e.started_at);
    if (t == null || t > now.getTime() || now.getTime() - t > hours * 3600000) continue;
    const b = best && instantMs(best.started_at);
    if (!best || t > b || (t === b && String(e.id) > String(best.id))) best = e;
  }
  return best;
}

/** The hours a reading stays on the health line. */
export const TEMPERATURE_HOURS = 24;

/**
 * When the health line for a child next changes on its own, as ms, or null:
 * the soonest wait ending, the last reading leaving after TEMPERATURE_HOURS, a
 * dose or reading dated ahead coming due, and — while the line shows anything —
 * midnight, when a time from the day before gains its date. The page redraws
 * once then rather than every minute.
 */
export function healthLineChangesAt(entries, babyId, now = new Date()) {
  const at = [];
  const waits = nextDoses(entries, babyId, now);
  const temp = latestTemperature(entries, babyId, now);
  if (waits.length) at.push(waits[0].notBefore.getTime());
  if (temp) at.push(instantMs(temp.started_at) + TEMPERATURE_HOURS * 3600000);
  const ahead = nextDatedEntry(entries, babyId, now);
  if (ahead != null) at.push(ahead);
  if (waits.length || temp) { const midnight = new Date(now); midnight.setHours(24, 0, 0, 0); at.push(midnight.getTime()); }
  return at.length ? Math.min(...at) : null;
}

/** When the soonest medicine or temperature entry dated after `now` comes due (a time typed ahead), as ms, or null. */
export function nextDatedEntry(entries, babyId, now = new Date()) {
  let soonest = null;
  for (const e of entries) {
    if (e.baby_id !== babyId || (e.entry_type !== "medicine" && e.entry_type !== "temperature")) continue;
    const t = instantMs(e.started_at);
    if (t != null && t > now.getTime() && (soonest == null || t < soonest)) soonest = t;
  }
  return soonest;
}
