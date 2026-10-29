import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";
import {
  localStamp, defaultUnits, gramsFrom, mmFrom, lbOz, fmtWeight, fmtLength, lengthValue, growthError,
  sortGrowth, growthSeries, chartPoints, defaultRecordRange, recordRangeError, recordUrl,
} from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

describe("localStamp", () => {
  it("writes the instant on the household's clock, with no zone", () => {
    // 03:30 UTC is 10:30 pm the evening before in New York (EST, UTC-5).
    expect(localStamp("2026-01-15T03:30:00.000Z", "America/New_York")).toBe("2026-01-14T22:30");
    expect(localStamp("2026-07-15T03:30:00.000Z", "America/New_York")).toBe("2026-07-14T23:30");
    expect(localStamp("2026-01-15T03:30:00.000Z", "Asia/Tokyo")).toBe("2026-01-15T12:30");
  });
  it("writes midnight as 00, not 24", () => {
    expect(localStamp("2026-01-15T05:00:00.000Z", "America/New_York")).toBe("2026-01-15T00:00");
  });
  it("falls back to the device clock for a missing or unusable zone, and is empty for a bad instant", () => {
    expect(localStamp("2026-01-15T03:30:00.000Z", null)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localStamp("2026-01-15T03:30:00.000Z", "Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localStamp("nope", "UTC")).toBe("");
  });
});

describe("growth units", () => {
  it("defaults to pounds and inches only where they are the norm", () => {
    expect(defaultUnits("en-US")).toBe("imperial");
    expect(defaultUnits("en-GB")).toBe("metric");
    expect(defaultUnits("fr-FR")).toBe("metric");
    expect(defaultUnits("")).toBe("metric");
  });
  it("converts a form's pounds and ounces, or kilograms, to whole grams", () => {
    expect(gramsFrom({ units: "imperial", lb: "7", oz: "8" })).toBe(3402);
    expect(gramsFrom({ units: "imperial", lb: "", oz: "12" })).toBe(340);
    expect(gramsFrom({ units: "imperial", lb: "", oz: "" })).toBeNull();
    expect(gramsFrom({ units: "imperial", lb: "x", oz: "" })).toBeNaN();
    expect(gramsFrom({ units: "metric", kg: "3.45" })).toBe(3450);
    expect(gramsFrom({ units: "metric", kg: " " })).toBeNull();
  });
  it("converts inches or centimetres to whole millimetres", () => {
    expect(mmFrom("20", "imperial")).toBe(508);
    expect(mmFrom("50.5", "metric")).toBe(505);
    expect(mmFrom("", "metric")).toBeNull();
    expect(mmFrom("abc", "metric")).toBeNaN();
  });
  it("round-trips a weight through the form without drifting", () => {
    expect(lbOz(3402)).toEqual({ lb: 7, oz: 8 });
    expect(gramsFrom({ units: "imperial", ...Object.fromEntries(Object.entries(lbOz(5100)).map(([k, v]) => [k, String(v)])) })).toBe(5100);
    expect(lengthValue(508, "imperial")).toBe("20");
    expect(lengthValue(505, "metric")).toBe("50.5");
    expect(lengthValue(null, "metric")).toBe("");
  });
  it("formats for display", () => {
    expect(fmtWeight(3402, "imperial")).toBe("7 lb 8 oz");
    expect(fmtWeight(3450, "metric")).toBe("3.45 kg");
    expect(fmtWeight(12300, "metric")).toBe("12.3 kg");
    expect(fmtWeight(null, "metric")).toBe("");
    expect(fmtLength(508, "imperial")).toBe("20.0 in");
    expect(fmtLength(505, "metric")).toBe("50.5 cm");
  });
});

describe("growthError", () => {
  const ok = { measured_date: "2026-05-01", weight_g: 3400, length_mm: null, head_mm: null };
  it("accepts any one measure", () => {
    expect(growthError(ok, "2026-05-02")).toBe("");
    expect(growthError({ ...ok, weight_g: null, head_mm: 350 }, "2026-05-02")).toBe("");
  });
  it("needs a real day that is not in the future", () => {
    expect(growthError({ ...ok, measured_date: "" }, "2026-05-02")).toMatch(/day/);
    expect(growthError({ ...ok, measured_date: "2026-02-30" }, "2026-05-02")).toMatch(/day/);
    expect(growthError({ ...ok, measured_date: "2026-05-03" }, "2026-05-02")).toMatch(/future/);
  });
  it("needs at least one measure, each a number in a plausible range", () => {
    expect(growthError({ ...ok, weight_g: null }, "2026-05-02")).toMatch(/Enter/);
    expect(growthError({ ...ok, weight_g: NaN }, "2026-05-02")).toMatch(/not a number/);
    // 7.5 typed into kilograms meant as pounds is still plausible; 75 kg is not.
    expect(growthError({ ...ok, weight_g: 75_000 }, "2026-05-02")).toMatch(/units/);
    expect(growthError({ ...ok, length_mm: 50 }, "2026-05-02")).toMatch(/length/);
    expect(growthError({ ...ok, head_mm: 900 }, "2026-05-02")).toMatch(/head size/);
  });
});

describe("growth series and chart", () => {
  const rows = [
    { id: "a", measured_date: "2026-05-01", weight_g: 3400, length_mm: 500, created_at: "1" },
    { id: "c", measured_date: "2026-06-01", weight_g: 5000, length_mm: null, created_at: "3" },
    { id: "b", measured_date: "2026-05-15", weight_g: 4000, length_mm: 520, created_at: "2" },
  ];
  it("sorts newest first and builds a series oldest first, skipping a measure not taken", () => {
    expect(sortGrowth(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(growthSeries(rows, "weight_g").map((p) => p.value)).toEqual([3400, 4000, 5000]);
    expect(growthSeries(rows, "length_mm").map((p) => p.date)).toEqual(["2026-05-01", "2026-05-15"]);
  });
  it("places points by calendar day inside the padded box", () => {
    const pts = chartPoints(growthSeries(rows, "weight_g"), 320, 110, 10);
    expect(pts[0].x).toBe(10);
    expect(pts.at(-1).x).toBe(310);
    // Heavier is higher, which on an SVG is a smaller y.
    expect(pts[0].y).toBeGreaterThan(pts.at(-1).y);
    for (const p of pts) { expect(p.y).toBeGreaterThanOrEqual(10); expect(p.y).toBeLessThanOrEqual(100); }
  });
  it("centres a single point and is empty for none", () => {
    const [p] = chartPoints([{ date: "2026-05-01", value: 3400 }], 320, 110, 10);
    expect(p.x).toBe(160);
    expect(chartPoints([], 320, 110)).toEqual([]);
  });
});

describe("report dates", () => {
  it("defaults to the two weeks ending on the household's today, both ends included", () => {
    expect(defaultRecordRange("2026-03-10")).toEqual({ from: "2026-02-25", to: "2026-03-10" });
    expect(defaultRecordRange(null)).toEqual({ from: "", to: "" });
  });
  it("refuses a range it cannot open", () => {
    expect(recordRangeError("2026-03-10", "2026-03-01")).toMatch(/later/);
    expect(recordRangeError("2026-13-01", "")).toMatch(/From/);
    expect(recordRangeError("", "")).toBe("");
  });
  it("leaves an empty bound off the address", () => {
    const url = new URL(recordUrl("/run/baby-log/api/reports", "full_record", "pdf", "", "2026-03-10", "https://x.test/run/baby-log/"));
    expect(url.pathname).toBe("/run/baby-log/api/reports/full_record");
    expect(url.searchParams.get("format")).toBe("pdf");
    expect(url.searchParams.has("from")).toBe(false);
    expect(url.searchParams.get("to")).toBe("2026-03-10");
  });
});

describe("manifest: growth and the report", () => {
  it("growth is shared like the log: everyone records under a stamped name, only an adult removes", () => {
    expect(manifest.row_policies.growth).toEqual(manifest.row_policies.entries);
    expect(manifest.member_references.growth).toEqual({ column: "created_by", on_removed: "keep" });
    // A growth curve needs the first measurement: no retention.
    expect(manifest.retention.growth).toBeUndefined();
  });
  it("the kinds the summary counts in SQL are plaintext", () => {
    expect(manifest.db_plaintext_columns).toEqual(expect.arrayContaining(["feed_kind", "diaper_kind"]));
  });
  it("declares the summary, the entry list and growth, each over a household-day range", () => {
    const views = manifest.reports.views;
    expect(views.map((v) => v.id)).toEqual(["daily_summary", "entries", "growth"]);
    for (const v of views) {
      expect(v.source.query, v.id).toMatch(/:range_start/);
      expect(v.source.query, v.id).toMatch(/:range_end/);
      expect(v.source.query, v.id).not.toMatch(/\bLIMIT\b/);
      expect(v.columns.length, v.id).toBeLessThanOrEqual(12);
    }
    // Entries are dated by the household's day, falling back to UTC only for those from before local_at.
    for (const id of ["daily_summary", "entries"]) {
      expect(views.find((v) => v.id === id).source.query).toContain("substr(COALESCE(NULLIF(e.local_at, ''), e.started_at), 1, 10) BETWEEN :range_start AND :range_end");
    }
  });
  it("reads its tables directly: the governed read refuses a governed table inside a CTE or subquery", () => {
    for (const v of manifest.reports.views) expect(v.source.query, v.id).not.toMatch(/^\s*WITH\b|\(\s*SELECT\b/i);
  });
  it("an alias over an encrypted value never carries a plaintext suffix, which would skip its decryption", () => {
    const plaintextSuffix = /_(id|at|date|by|time)$/;
    for (const v of manifest.reports.views) {
      for (const c of v.columns) {
        if (["who", "note", "child", "detail"].includes(c.key)) expect(c.key, `${v.id}.${c.key}`).not.toMatch(plaintextSuffix);
      }
    }
  });
});

describe("runningSleepClash", () => {
  it("is a UNIQUE refusal of a write that leaves a nap running, and nothing else", async () => {
    const { runningSleepClash } = await import("../src/logic.js");
    const unique = { status: 400, code: "UNIQUE_CONSTRAINT" };
    expect(runningSleepClash(unique, { entry_type: "sleep", ended_at: null })).toBe(true);
    expect(runningSleepClash({ message: "UNIQUE constraint failed: app_baby_log__entries.baby_id" }, { entry_type: "sleep", ended_at: "" })).toBe(true);
    expect(runningSleepClash(unique, { entry_type: "sleep", ended_at: "2026-01-05T15:00:00.000Z" })).toBe(false);
    expect(runningSleepClash(unique, { entry_type: "feed", ended_at: null })).toBe(false);
    expect(runningSleepClash({ status: 500 }, { entry_type: "sleep", ended_at: null })).toBe(false);
  });
});

describe("changedFields", () => {
  it("keeps only what the form changed, so a stale form cannot write back a field someone else set", async () => {
    const { changedFields } = await import("../src/logic.js");
    const opened = { entry_type: "sleep", started_at: "2026-01-05T13:00:00.000Z", ended_at: null, amount_ml: null, note: "" };
    // A note added to a nap that was running when the form opened: the empty end is not sent.
    expect(changedFields(opened, { ...opened, note: "Fussed first" })).toEqual({ note: "Fussed first" });
    // An end the form itself set is sent.
    expect(changedFields(opened, { ...opened, ended_at: "2026-01-05T14:00:00.000Z" })).toEqual({ ended_at: "2026-01-05T14:00:00.000Z" });
    // null and "" are the same empty value; numbers compare as text.
    expect(changedFields({ amount_ml: 120, note: null }, { amount_ml: "120", note: "" })).toEqual({});
    // No opened row: everything.
    expect(changedFields(null, { note: "x" })).toEqual({ note: "x" });
  });
});
