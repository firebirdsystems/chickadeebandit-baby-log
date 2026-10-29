import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";
import {
  ageInDays, lmsAt, zScore, normalCdf, whoPercentile, percentileLabel, percentileLine, percentileChart, PERCENTILE_LINES,
} from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// The percentile columns of the CDC files src/who-growth.js was generated from.
const cdc = JSON.parse(readFileSync(join(__dirname, "fixtures/cdc-who-percentiles.json"), "utf-8"));
const COLUMN_PERCENT = { "2nd (2.3rd)": 2.275, "5th": 5, "10th": 10, "25th": 25, "50th": 50, "75th": 75, "90th": 90, "95th": 95, "98th (97.7th)": 97.725 };
const STORED = { weight: ["weight_g", 1000], length: ["length_mm", 10], head: ["head_mm", 10] };
const DAYS_PER_MONTH = 365.25 / 12;

describe("WHO percentiles against CDC's published tables", () => {
  for (const [measure, bySex] of Object.entries(cdc)) {
    for (const [sex, { columns, rows }] of Object.entries(bySex)) {
      it(`${measure}, ${sex}: every month's published percentile values come out at their percentile`, () => {
        const [column, factor] = STORED[measure];
        for (const [month, ...values] of rows) {
          // A birth date and a measured date exactly `month` months apart, in days.
          const lms = lmsAt(measure, sex, month * DAYS_PER_MONTH);
          columns.forEach((name, i) => {
            const p = normalCdf(zScore(lms, values[i])) * 100;
            expect(Math.abs(p - COLUMN_PERCENT[name]), `${measure} ${sex} month ${month} ${name}`).toBeLessThan(0.1);
          });
          // And through the page's own entry point, from stored units.
          expect(whoPercentile(column, values[columns.indexOf("50th")] * factor, sex, "2026-01-01", "2026-01-01")).toBeDefined();
        }
      });
    }
  }
});

describe("whoPercentile", () => {
  it("places a stored measurement by the child's sex and age on the measured day", () => {
    // WHO median birth weight: 3.3464 kg for boys, 3.2322 kg for girls.
    expect(Math.round(whoPercentile("weight_g", 3346.4, "male", "2026-01-01", "2026-01-01"))).toBe(50);
    expect(Math.round(whoPercentile("weight_g", 3232.2, "female", "2026-01-01", "2026-01-01"))).toBe(50);
    // The same weight is a higher percentile for a girl.
    expect(whoPercentile("weight_g", 3346, "female", "2026-01-01", "2026-01-01")).toBeGreaterThan(50);
  });
  it("interpolates between months rather than stepping", () => {
    const at = (d) => whoPercentile("weight_g", 5000, "male", "2026-01-01", d);
    const [a, b, c] = [at("2026-02-01"), at("2026-02-16"), at("2026-03-01")];
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
  it("is null with no sex, no birth date, a date before birth, past 24 months, or no value", () => {
    expect(whoPercentile("weight_g", 5000, "", "2026-01-01", "2026-03-01")).toBeNull();
    expect(whoPercentile("weight_g", 5000, "male", "", "2026-03-01")).toBeNull();
    expect(whoPercentile("weight_g", 5000, "male", "2026-03-01", "2026-01-01")).toBeNull();
    expect(whoPercentile("weight_g", 12000, "male", "2024-01-01", "2026-03-01")).toBeNull();
    expect(whoPercentile("weight_g", null, "male", "2026-01-01", "2026-03-01")).toBeNull();
    expect(whoPercentile("weight_g", 0, "male", "2026-01-01", "2026-03-01")).toBeNull();
  });
  it("reaches 24 months exactly, across a leap day too, and stops after", () => {
    expect(whoPercentile("length_mm", 876, "male", "2024-01-01", "2026-01-01")).not.toBeNull(); // 731 days
    expect(whoPercentile("length_mm", 876, "male", "2025-01-01", "2027-01-01")).not.toBeNull(); // 730 days
    expect(whoPercentile("length_mm", 876, "male", "2024-01-01", "2026-01-02")).toBeNull();
  });
  it("keeps rising past 3 SD on weight (WHO's restricted method), with no jump at 3", () => {
    const lms = lmsAt("weight", "male", 6 * DAYS_PER_MONTH);
    const z = (kg) => zScore(lms, kg);
    expect(z(14)).toBeGreaterThan(z(12));
    expect(z(3)).toBeLessThan(z(4));
    // Just either side of the +3 SD value.
    const sd3 = lms.M * Math.pow(1 + lms.L * lms.S * 3, 1 / lms.L);
    expect(Math.abs(z(sd3 * 1.0001) - z(sd3 * 0.9999))).toBeLessThan(0.01);
  });
});

describe("normalCdf", () => {
  it("matches the standard normal table", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-2)).toBeCloseTo(0.02275, 4);
  });
});

describe("percentileLabel", () => {
  it("writes ordinals, with the ends said in words", () => {
    expect(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "48th", "99th"])
      .toEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 48, 99].map(percentileLabel));
    expect(percentileLabel(0.4)).toBe("below the 1st");
    expect(percentileLabel(99.6)).toBe("above the 99th");
    expect(percentileLabel(null)).toBe("");
  });
});

describe("ageInDays", () => {
  it("counts calendar days", () => {
    expect(ageInDays("2026-01-01", "2026-01-31")).toBe(30);
    expect(ageInDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(ageInDays("", "2026-01-31")).toBeNull();
  });
});

describe("percentile lines and chart", () => {
  it("draws nine lines, the 2nd lowest and the 98th highest, in stored units", () => {
    expect(PERCENTILE_LINES.map((l) => l.label)).toEqual(["2nd", "5th", "10th", "25th", "50th", "75th", "90th", "95th", "98th"]);
    const [lo] = percentileLine("weight_g", "female", -2, [0]);
    const [mid] = percentileLine("weight_g", "female", 0, [0]);
    expect(mid).toBeCloseTo(3232.2, 1);
    expect(lo).toBeLessThan(mid);
  });
  it("places the child's points among the lines by age", () => {
    const chart = percentileChart([{ days: 0, value: 3400 }, { days: 90, value: 6200 }], "weight_g", "male", 320, 130, 10);
    expect(chart.lines).toHaveLength(9);
    expect(chart.dots[0].x).toBe(10);
    expect(chart.dots[1].x).toBe(310);
    // Higher values are higher up, which on an SVG is a smaller y.
    const end = (label) => chart.lines.find((l) => l.label === label).points.at(-1).y;
    expect(end("98th")).toBeLessThan(end("2nd"));
  });
  it("widens a single measurement to two months so it sits among the lines", () => {
    const chart = percentileChart([{ days: 90, value: 6000 }], "weight_g", "female", 320, 130, 10);
    expect(chart.dots[0].x).toBe(160);
  });
  it("cannot be drawn by age for a measurement past 24 months or with no age", () => {
    expect(percentileChart([{ days: 800, value: 12000 }], "weight_g", "male", 320, 130)).toBeNull();
    expect(percentileChart([{ days: null, value: 12000 }], "weight_g", "male", 320, 130)).toBeNull();
  });
});
