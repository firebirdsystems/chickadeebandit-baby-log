import { describe, it, expect } from "vitest";
import {
  typeMeta, fmtDuration, timeAgo, dayKey, groupByDay, summarizeDay,
  runningSleep, ageLabel, entryDetail,
} from "../src/logic.js";

const T = (iso) => new Date(iso);

describe("fmtDuration", () => {
  it("formats minutes and hours", () => {
    expect(fmtDuration(30000)).toBe("<1m");
    expect(fmtDuration(45 * 60000)).toBe("45m");
    expect(fmtDuration(125 * 60000)).toBe("2h 05m");
  });
  it("is null-safe", () => {
    expect(fmtDuration(null)).toBe("");
    expect(fmtDuration(-5)).toBe("");
  });
});

describe("timeAgo", () => {
  const now = T("2026-07-12T12:00:00Z");
  it("buckets by minute/hour/day", () => {
    expect(timeAgo("2026-07-12T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-07-12T11:35:00Z", now)).toBe("25m ago");
    expect(timeAgo("2026-07-12T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-07-10T09:00:00Z", now)).toBe("2d ago");
  });
  it("returns empty for garbage", () => expect(timeAgo("nope", now)).toBe(""));
});

describe("groupByDay", () => {
  it("groups newest-first by local day", () => {
    const entries = [
      { id: "a", started_at: "2026-07-11T08:00:00" },
      { id: "b", started_at: "2026-07-12T09:00:00" },
      { id: "c", started_at: "2026-07-12T07:00:00" },
    ];
    const groups = groupByDay(entries);
    expect(groups.map((g) => g.key)).toEqual(["2026-07-12", "2026-07-11"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["b", "c"]);
  });
});

describe("summarizeDay", () => {
  const key = "2026-07-12";
  const now = T("2026-07-12T12:00:00");
  it("counts feeds/diapers and totals finished sleep", () => {
    const entries = [
      { entry_type: "feed", started_at: "2026-07-12T06:00:00" },
      { entry_type: "feed", started_at: "2026-07-12T09:00:00" },
      { entry_type: "diaper", started_at: "2026-07-12T07:00:00" },
      { entry_type: "sleep", started_at: "2026-07-12T01:00:00", ended_at: "2026-07-12T03:00:00" },
      { entry_type: "feed", started_at: "2026-07-11T22:00:00" }, // other day — ignored
    ];
    const s = summarizeDay(entries, key, now);
    expect(s.feedCount).toBe(2);
    expect(s.diaperCount).toBe(1);
    expect(s.sleepMs).toBe(2 * 3600000);
    expect(s.sleeping).toBe(false);
    expect(s.lastFeedAt).toBe("2026-07-12T09:00:00");
  });
  it("counts a running sleep up to now", () => {
    const entries = [{ entry_type: "sleep", started_at: "2026-07-12T11:00:00", ended_at: null }];
    const s = summarizeDay(entries, key, now);
    expect(s.sleeping).toBe(true);
    expect(s.sleepMs).toBe(3600000);
  });
});

describe("runningSleep", () => {
  it("returns the newest unfinished sleep for the baby", () => {
    const entries = [
      { id: "s1", baby_id: "b1", entry_type: "sleep", started_at: "2026-07-12T01:00:00", ended_at: "2026-07-12T02:00:00" },
      { id: "s2", baby_id: "b1", entry_type: "sleep", started_at: "2026-07-12T11:00:00", ended_at: null },
      { id: "s3", baby_id: "b2", entry_type: "sleep", started_at: "2026-07-12T11:30:00", ended_at: null },
    ];
    expect(runningSleep(entries, "b1")?.id).toBe("s2");
    expect(runningSleep(entries, "b2")?.id).toBe("s3");
    expect(runningSleep([], "b1")).toBeNull();
  });
});

describe("ageLabel", () => {
  const now = T("2026-07-12T12:00:00");
  it("scales days → weeks → months → years", () => {
    expect(ageLabel("2026-07-08", now)).toBe("4 days");
    expect(ageLabel("2026-06-01", now)).toBe("5 weeks");
    expect(ageLabel("2026-01-12", now)).toBe("5 months");
    expect(ageLabel("2023-07-01", now)).toBe("3 years");
  });
  it("empty for missing/future dates", () => {
    expect(ageLabel("", now)).toBe("");
    expect(ageLabel("2027-01-01", now)).toBe("");
  });
});

describe("entryDetail", () => {
  it("describes feeds, diapers, and sleep durations", () => {
    expect(entryDetail({ entry_type: "feed", feed_kind: "bottle", amount_ml: 120 })).toBe("Bottle · 120 ml");
    expect(entryDetail({ entry_type: "diaper", diaper_kind: "both" })).toBe("Wet + dirty");
    expect(entryDetail({ entry_type: "sleep", started_at: "2026-07-12T01:00:00", ended_at: "2026-07-12T02:30:00" })).toBe("1h 30m");
    expect(entryDetail({ entry_type: "sleep", started_at: "2026-07-12T01:00:00", ended_at: null })).toBe("sleeping…");
  });
});

describe("typeMeta", () => {
  it("falls back to note", () => expect(typeMeta("bogus").value).toBe("note"));
});
