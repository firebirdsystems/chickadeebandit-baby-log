import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";
import {
  REMINDER_KINDS, reminderMinutes, suggestedMinutes, fmtMinutes, reminderChoices, nextReminders,
} from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));
const migration = readFileSync(join(__dirname, "../migrations/005_interval_reminders.sql"), "utf-8");

const kind = (id) => REMINDER_KINDS.find((k) => k.id === id);
const baby = (over = {}) => ({ id: "b1", feed_interval_min: 180, wake_window_min: 90, max_nap_min: 120, ...over });
const e = (id, type, startedAt, endedAt = null, babyId = "b1") =>
  ({ id, baby_id: babyId, entry_type: type, started_at: startedAt, ended_at: endedAt });
const due = (b, entries) => Object.fromEntries(nextReminders(b, entries).map((r) => [r.kind.id, r.dueAt.toISOString()]));

describe("reminderMinutes: the hub's 1 minute to 72 hours, anything else off", () => {
  it("reads whole minutes and treats unset, zero, negative and out-of-range as off", () => {
    expect(reminderMinutes(baby(), kind("feed"))).toBe(180);
    expect(reminderMinutes(baby({ feed_interval_min: "150" }), kind("feed"))).toBe(150);
    expect(reminderMinutes(baby({ feed_interval_min: 90.7 }), kind("feed"))).toBe(90);
    for (const off of [null, undefined, "", 0, -5, 4321, "soon"]) {
      expect(reminderMinutes(baby({ feed_interval_min: off }), kind("feed")), String(off)).toBeNull();
    }
    expect(reminderMinutes(baby({ feed_interval_min: 4320 }), kind("feed"))).toBe(4320);
  });
});

describe("suggestedMinutes", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("lengthens the wake window with age", () => {
    expect(suggestedMinutes("wake_window", "2026-10-20", now)).toBe(60);
    expect(suggestedMinutes("wake_window", "2026-08-29", now)).toBe(90);
    expect(suggestedMinutes("wake_window", "2025-11-01", now)).toBe(195);
    expect(suggestedMinutes("wake_window", "2024-01-01", now)).toBe(330);
  });
  it("spaces feeds out with age", () => {
    expect(suggestedMinutes("feed", "2026-10-01", now)).toBe(180);
    expect(suggestedMinutes("feed", "2026-01-01", now)).toBe(240);
  });
  it("suggests nothing for long sleep, which would fire every night", () => {
    for (const born of ["2026-10-01", "2026-01-01", ""]) expect(suggestedMinutes("long_nap", born, now)).toBeNull();
  });
  it("falls back when the birth date is missing, malformed or in the future", () => {
    for (const bad of ["", "nope", "2027-01-01"]) expect(suggestedMinutes("feed", bad, now), bad).toBe(180);
  });
});

describe("reminderChoices and fmtMinutes", () => {
  it("offers quarter hours and keeps an off-grid stored value or suggestion", () => {
    const choices = reminderChoices("feed", 200, 210);
    expect(choices[0]).toBe(60);
    expect(choices.at(-1)).toBe(360);
    expect(choices).toContain(200);
    expect(choices).toContain(210);
    expect(reminderChoices("feed", null, 5000)).not.toContain(5000);
  });
  it("formats", () => {
    expect(fmtMinutes(45)).toBe("45 min");
    expect(fmtMinutes(180)).toBe("3 h");
    expect(fmtMinutes(135)).toBe("2 h 15 min");
  });
});

describe("nextReminders mirrors the hub's anchors", () => {
  it("counts a feed from when it started, and ignores other children's", () => {
    const entries = [
      e("f1", "feed", "2026-07-09T06:00:00.000Z"),
      e("f2", "feed", "2026-07-09T09:00:00.000Z"),
      e("x", "feed", "2026-07-09T11:00:00.000Z", null, "b2"),
    ];
    expect(due(baby({ wake_window_min: null }), entries)).toEqual({ feed: "2026-07-09T12:00:00.000Z" });
  });

  it("counts the wake window from the end of the latest sleep, and waits while one runs", () => {
    const ended = [e("s1", "sleep", "2026-07-09T07:00:00.000Z", "2026-07-09T08:30:00.000Z")];
    expect(due(baby({ feed_interval_min: null }), ended)).toEqual({ wake_window: "2026-07-09T10:00:00.000Z" });
    const running = [...ended, e("s2", "sleep", "2026-07-09T10:00:00.000Z")];
    expect(due(baby({ feed_interval_min: null }), running)).toEqual({ long_nap: "2026-07-09T12:00:00.000Z" });
  });

  it("keeps waiting out a running sleep when an earlier nap is added afterwards", () => {
    const entries = [
      e("s2", "sleep", "2026-07-09T13:00:00.000Z"),
      e("s1", "sleep", "2026-07-09T11:00:00.000Z", "2026-07-09T12:00:00.000Z"),
    ];
    expect(due(baby({ feed_interval_min: null, max_nap_min: null }), entries)).toEqual({});
  });

  it("treats an empty end as running for the wake window but not for long sleep, as the hub does", () => {
    // The hub's long-sleep kind is running_when { ended_at: null }; an empty
    // end ('' from some other writer) holds the wake window and sends nothing.
    const entries = [e("s1", "sleep", "2026-07-09T05:00:00.000Z", "")];
    expect(due(baby({ feed_interval_min: null }), entries)).toEqual({});
  });

  it("ignores a time not in toISOString form, as the hub does", () => {
    const entries = [e("f1", "feed", "2026-07-09T05:00:00.000Z"), e("f2", "feed", "2026-07-09T11:50")];
    expect(due(baby({ wake_window_min: null }), entries)).toEqual({ feed: "2026-07-09T08:00:00.000Z" });
  });

  it("breaks a tie by id, and returns nothing for reminders that are off", () => {
    const entries = [e("fa", "feed", "2026-07-09T09:00:00.000Z"), e("fz", "feed", "2026-07-09T09:00:00.000Z")];
    expect(nextReminders(baby({ wake_window_min: null }), entries)[0].kind.id).toBe("feed");
    expect(nextReminders(baby({ feed_interval_min: null, wake_window_min: null, max_nap_min: null }), entries)).toEqual([]);
  });
});

describe("the manifest's interval_reminders block", () => {
  const config = manifest.interval_reminders;
  it("declares one kind per REMINDER_KINDS entry, reading the columns migration 005 adds", () => {
    expect(config.kinds.map((k) => [k.id, k.interval_column])).toEqual(REMINDER_KINDS.map((k) => [k.id, k.column]));
    for (const k of REMINDER_KINDS) expect(migration).toContain(`ADD COLUMN ${k.column} INTEGER;`);
  });
  it("orders the wake window by when the sleep started, so a running sleep holds it", () => {
    const wake = config.kinds.find((k) => k.id === "wake_window");
    expect(wake.anchor_column).toBe("ended_at");
    expect(wake.order_column).toBe("started_at");
  });
  it("sends to whoever is on shift, never names a column the hub cannot read in plaintext, and needs cron", () => {
    expect(config.attendant).toEqual({ table: "shifts", member_column: "member_id", open_when: { ended_at: "" } });
    expect(manifest.row_policies.shifts.member_column).toBe("member_id");
    expect(manifest.db_plaintext_columns).toContain("entry_type");
    expect(manifest.required_capabilities).toContain("cron");
  });
});
