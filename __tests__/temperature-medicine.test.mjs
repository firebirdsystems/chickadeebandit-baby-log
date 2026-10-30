import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";
import {
  ENTRY_TYPES, entryDetail, searchableFields, tempC100From, tempValue, fmtTemp, isFever, tempError,
  medicineError, repeatChoices, recentMedicines, knownMedicine, nextDoses, doseWait, doseWaits, latestTemperature, nextDatedEntry, healthLineChangesAt,
} from "../src/logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const NOW = new Date("2026-10-29T18:00:00.000Z");
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60000).toISOString();
let n = 0;
const dose = (minutesAgo, fields = {}) => ({ id: `m${++n}`, baby_id: "b1", entry_type: "medicine", started_at: at(minutesAgo), med_name: "Infant Tylenol", med_dose: "2.5 ml", repeat_after_min: 240, ...fields });
const temp = (minutesAgo, c100, fields = {}) => ({ id: `t${++n}`, baby_id: "b1", entry_type: "temperature", started_at: at(minutesAgo), temp_c100: c100, temp_method: "rectal", ...fields });

describe("the two entry types", () => {
  it("are offered beside the others", () => {
    expect(ENTRY_TYPES.map((t) => t.value)).toEqual(["feed", "diaper", "sleep", "pump", "temperature", "medicine", "note"]);
  });
  it("read on the timeline in the viewer's units, a fever marked", () => {
    expect(entryDetail(temp(0, 3844), "imperial")).toBe("101.2 °F, fever · Rectal");
    expect(entryDetail(temp(0, 3700, { temp_method: "" }), "metric")).toBe("37.0 °C");
    expect(entryDetail(dose(0))).toBe("Infant Tylenol · 2.5 ml");
  });
  it("a medicine's name and dose are searchable", () => {
    expect(searchableFields(dose(0))).toEqual(expect.arrayContaining(["Infant Tylenol", "2.5 ml"]));
  });
});

describe("temperatures", () => {
  it("round-trip a typed °F through hundredths of a degree Celsius", () => {
    for (const f of ["97.5", "98.6", "100.4", "101.2", "103.9", "104.1"]) {
      expect(tempValue(tempC100From(f, "imperial"), "imperial")).toBe(f);
    }
    expect(tempC100From("38.4", "metric")).toBe(3840);
    expect(tempValue(3840, "metric")).toBe("38.4");
  });
  it("are taken to the tenth shown first, so °C and °F agree on a fever", () => {
    expect(tempC100From("37.97", "metric")).toBe(3800);
    expect(tempC100From("100.35", "imperial")).toBe(3800);
    for (const c100 of [tempC100From("37.97", "metric"), tempC100From("100.35", "imperial"), tempC100From("100.3", "imperial"), tempC100From("37.9", "metric")]) {
      expect(isFever(c100, "metric"), String(c100)).toBe(isFever(c100, "imperial"));
    }
  });
  it("empty is null, not a number is NaN, and neither saves", () => {
    expect(tempC100From("", "metric")).toBeNull();
    expect(tempC100From("abc", "metric")).toBeNaN();
    expect(tempError(null)).toBe("Enter the temperature.");
    expect(tempError(NaN)).toBe("The temperature is not a number.");
  });
  it("refuses a reading far outside a body's — a typo, or °C typed as °F", () => {
    expect(tempError(tempC100From("1012", "imperial"))).toMatch(/looks wrong/);
    expect(tempError(tempC100From("38.4", "imperial"))).toMatch(/looks wrong/);
    expect(tempError(tempC100From("38.4", "metric"))).toBe("");
  });
  it("a fever is 38.0 °C (100.4 °F) or more", () => {
    expect(isFever(tempC100From("100.4", "imperial"), "imperial")).toBe(true);
    expect(isFever(tempC100From("100.3", "imperial"), "imperial")).toBe(false);
    expect(isFever(3800)).toBe(true);
    // Judged on the tenth shown, so the label agrees with the number beside it.
    expect(fmtTemp(3797, "metric")).toBe("38.0 °C");
    expect(isFever(3797, "metric")).toBe(true);
    expect(fmtTemp(3797, "imperial")).toBe("100.3 °F");
    expect(isFever(3797, "imperial")).toBe(false);
    expect(isFever(3794, "metric")).toBe(false);
    expect(isFever(null)).toBe(false);
    expect(fmtTemp(null, "metric")).toBe("");
  });
  it("the latest reading of the last day is the one shown", () => {
    const rows = [temp(30, 3810), temp(90, 3900), temp(25 * 60, 4000), temp(10, 3700, { baby_id: "b2" })];
    expect(latestTemperature(rows, "b1", NOW).temp_c100).toBe(3810);
    expect(latestTemperature([temp(25 * 60, 4000)], "b1", NOW)).toBeNull();
    // Two at the same instant: the later id, whatever order they load in.
    const a = temp(5, 3700, { id: "ta" }), b = temp(5, 3900, { id: "tb" });
    expect(latestTemperature([a, b], "b1", NOW).id).toBe("tb");
    expect(latestTemperature([b, a], "b1", NOW).id).toBe("tb");
  });
});

describe("medicines", () => {
  it("need a name", () => {
    expect(medicineError({ med_name: "  " })).toBe("Enter the medicine.");
    expect(medicineError({ med_name: "Motrin" })).toBe("");
  });
  it("offer the waits a label gives, and keep a stored one off the list", () => {
    expect(repeatChoices()).toEqual([240, 360, 480, 720, 1440]);
    expect(repeatChoices(300)).toEqual([240, 300, 360, 480, 720, 1440]);
    expect(repeatChoices(null)).toEqual([240, 360, 480, 720, 1440]);
  });
  it("the recent list is one per medicine, newest first, as last typed", () => {
    const rows = [dose(60), dose(500, { med_name: "infant  tylenol" }), dose(120, { med_name: "Motrin", med_dose: "1.25 ml", repeat_after_min: 360 }), dose(5, { baby_id: "b2", med_name: "Other" })];
    expect(recentMedicines(rows, "b1")).toEqual([
      { med_name: "Infant Tylenol", med_dose: "2.5 ml", repeat_after_min: 240 },
      { med_name: "Motrin", med_dose: "1.25 ml", repeat_after_min: 360 },
    ]);
  });
  it("a recent medicine carries the wait of its last dose, none when that dose had none", () => {
    expect(recentMedicines([dose(10, { repeat_after_min: null }), dose(300)], "b1")[0].repeat_after_min).toBeNull();
  });
  it("every medicine is known, not only the newest six", () => {
    const rows = [dose(600, { med_name: "Ibuprofen", repeat_after_min: 360 }), ...["A", "B", "C", "D", "E", "F"].map((n, i) => dose(10 + i, { med_name: n }))];
    expect(knownMedicine(recentMedicines(rows, "b1"), "ibuprofen")?.repeat_after_min).toBe(360);
  });
  it("a name typed is matched to a recent medicine as the log matches names", () => {
    const meds = recentMedicines([dose(10), dose(20, { med_name: "Motrin", repeat_after_min: 360 })], "b1");
    expect(knownMedicine(meds, "  motrin ")?.repeat_after_min).toBe(360);
    expect(knownMedicine(meds, "Mot")).toBeNull();
    expect(knownMedicine(meds, "")).toBeNull();
  });
});

describe("not again before", () => {
  it("is the last dose plus the medicine's wait, while it has not passed", () => {
    const [w] = nextDoses([dose(60), dose(400)], "b1", NOW);
    expect(w.notBefore.toISOString()).toBe(at(60 - 240));
    expect(w.givenAt).toBe(at(60));
    expect(w.name).toBe("Infant Tylenol");
  });
  it("a wait over a year is no wait, as the mobile widget reads it", () => {
    expect(nextDoses([dose(60, { repeat_after_min: 525_601 })], "b1", NOW)).toEqual([]);
    expect(nextDoses([dose(60, { repeat_after_min: 525_600 })], "b1", NOW)).toHaveLength(1);
  });
  it("is gone once the wait has passed", () => {
    expect(nextDoses([dose(241)], "b1", NOW)).toEqual([]);
  });
  it("a last dose logged with no wait has none: an earlier dose's wait is not borrowed", () => {
    expect(nextDoses([dose(30, { repeat_after_min: null }), dose(200)], "b1", NOW)).toEqual([]);
  });
  it("the latest wait stated for a medicine is the one that applies", () => {
    const [w] = nextDoses([dose(30, { repeat_after_min: 360 }), dose(400, { repeat_after_min: 240 })], "b1", NOW);
    expect(w.notBefore.toISOString()).toBe(at(30 - 360));
  });
  it("one line per medicine, soonest first; nothing for a medicine with no wait said, or another child's", () => {
    const rows = [dose(30), dose(10, { med_name: "Motrin", repeat_after_min: 360 }), dose(5, { med_name: "Saline", repeat_after_min: null }), dose(5, { baby_id: "b2" })];
    expect(nextDoses(rows, "b1", NOW).map((w) => w.name)).toEqual(["Infant Tylenol", "Motrin"]);
  });
});

describe("the form's wait notice", () => {
  it("judges a dose against the logged doses either side of its time, within the wait that governs each", () => {
    const rows = [dose(60)];
    // Back-filled for five hours ago: the 60-minutes-ago dose is 4 h later, just outside a 4 h wait.
    expect(doseWait(rows, "b1", "Infant Tylenol", new Date(NOW.getTime() - 300 * 60000), 240)).toBeNull();
    // Back-filled for three hours ago: the later dose is 2 h after it.
    expect(doseWait(rows, "b1", "Infant Tylenol", new Date(NOW.getTime() - 180 * 60000), 240).givenAt).toBe(at(60));
    // A form opened before another phone logged its dose a few minutes later: the form's wait judges it.
    expect(doseWait([dose(-5)], "b1", "Infant Tylenol", NOW, 240).givenAt).toBe(at(-5));
  });
  it("a dose dated ahead by mistake does not set the wait; the wait chosen for the new dose judges the doses after it", () => {
    const rows = [dose(60), dose(-24 * 60, { repeat_after_min: 720 })];
    expect(doseWait(rows, "b1", "Infant Tylenol", NOW, null).notBefore.toISOString()).toBe(at(60 - 240));
    // A dose 3 h after this one: inside a 4 h wait chosen now, outside a 2 h one.
    const after = [dose(-180, { repeat_after_min: null }), dose(600)];
    expect(doseWait(after, "b1", "Infant Tylenol", NOW, 240)?.givenAt).toBe(at(-180));
    expect(doseWait(after, "b1", "Infant Tylenol", NOW, 120)).toBeNull();
  });
  it("a dose before the new one is judged on its own wait; one after it, on the form's, else its own", () => {
    // The nanny's 11:00 dose said no wait; this form's 4 h is about the doses after it.
    expect(doseWait([dose(60, { repeat_after_min: null })], "b1", "Infant Tylenol", NOW, 240)).toBeNull();
    // Another phone logged one a minute after this form's time, with a 4 h wait; this form says nothing.
    expect(doseWait([dose(-1)], "b1", "Infant Tylenol", NOW, null)?.givenAt).toBe(at(-1));
    // This form's 2 h governs a dose 3 h after it, whatever that dose says.
    expect(doseWait([dose(-180)], "b1", "Infant Tylenol", NOW, 120)).toBeNull();
  });
  it("leaves out the dose being saved, stored by a try whose answer was lost", () => {
    const rows = [dose(0, { id: "pinned" })];
    expect(doseWait(rows, "b1", "Infant Tylenol", NOW, null, "pinned")).toBeNull();
    expect(doseWait(rows, "b1", "Infant Tylenol", NOW, null)?.givenAt).toBe(at(0));
  });
  it("judges only the doses either side, never an older one's wait, as the log does", () => {
    // The last dose said no wait: the log shows none, and so does the form.
    const rows = [dose(30, { repeat_after_min: null }), dose(200)];
    expect(nextDoses(rows, "b1", NOW)).toEqual([]);
    expect(doseWait(rows, "b1", "Infant Tylenol", NOW, null)).toBeNull();
    // A wait shortened from a day to 4 h: the 5 h-old dose's 4 h is over.
    expect(doseWait([dose(300), dose(600, { repeat_after_min: 1440 })], "b1", "Infant Tylenol", NOW, 240)).toBeNull();
    // Only the first dose after it: one an hour on (1 h wait) is clear, one 3 h on is not looked at.
    expect(doseWait([dose(-60, { repeat_after_min: 60 }), dose(-180, { repeat_after_min: 1440 })], "b1", "Infant Tylenol", NOW, null)).toBeNull();
  });
  it("names the doses on both sides when both are too close, nearest first", () => {
    // One a minute before the form's time, and one the nanny logged three minutes after it.
    const ws = doseWaits([dose(1), dose(-3)], "b1", "Infant Tylenol", NOW, 240);
    expect(ws.map((w) => w.givenAt)).toEqual([at(1), at(-3)]);
    expect(doseWait([dose(1), dose(-3)], "b1", "Infant Tylenol", NOW, 240).givenAt).toBe(at(1));
    expect(doseWaits([dose(1)], "b1", "", NOW, 240)).toEqual([]);
  });
  it("names each dose by its id: two logged in the same minute are two doses", () => {
    const ws = doseWaits([dose(1, { id: "parent" }), dose(1, { id: "nanny" })], "b1", "Infant Tylenol", NOW, 240);
    expect(ws.map((w) => w.id).sort()).toEqual(["nanny", "parent"]);
  });
  it("the chips and the wait filled in come from the last dose given, not one dated ahead", () => {
    const rows = [dose(60), dose(-24 * 60, { med_dose: "5 ml", repeat_after_min: 1440 })];
    expect(recentMedicines(rows, "b1", Infinity, NOW)[0]).toEqual({ med_name: "Infant Tylenol", med_dose: "2.5 ml", repeat_after_min: 240 });
  });
  it("a time out of range is no time, as the widget reads it", () => {
    expect(nextDoses([dose(0, { started_at: "2026-10-28T24:00:00Z", repeat_after_min: 10080 })], "b1", NOW)).toEqual([]);
    expect(nextDoses([dose(0, { started_at: "2026-09-31T10:00:00Z", repeat_after_min: 43200 })], "b1", NOW)).toEqual([]);
    expect(nextDoses([dose(0, { started_at: "2026-10-29T19:00:00+02:00" })], "b1", NOW)[0]?.notBefore.toISOString()).toBe("2026-10-29T21:00:00.000Z");
  });
  it("names the nearest dose when there are two", () => {
    expect(doseWait([dose(200), dose(30)], "b1", "Infant Tylenol", NOW, null).givenAt).toBe(at(30));
  });
  it("a dose dated in the future is not the last one given", () => {
    const [w] = nextDoses([dose(60), dose(-180)], "b1", NOW);
    expect(w.givenAt).toBe(at(60));
  });
  it("names the wait a new dose of that medicine would fall inside, however the name is spaced or cased", () => {
    const w = doseWait([dose(60)], "b1", "  infant   TYLENOL ", NOW, null);
    expect(w.notBefore.toISOString()).toBe(at(60 - 240));
    expect(doseWait([dose(60)], "b1", "Motrin", NOW, null)).toBeNull();
    expect(doseWait([dose(60)], "b1", "", NOW, null)).toBeNull();
    expect(doseWait([dose(300)], "b1", "Infant Tylenol", NOW, null)).toBeNull();
  });
});

describe("the page's next redraw", () => {
  it("is the soonest medicine or temperature dated ahead of now", () => {
    expect(nextDatedEntry([dose(-30), temp(-10, 3700), dose(60), { id: "f", baby_id: "b1", entry_type: "feed", started_at: at(-5) }], "b1", NOW)).toBe(NOW.getTime() + 10 * 60000);
    expect(nextDatedEntry([dose(60)], "b1", NOW)).toBeNull();
  });
});

describe("when the health line next changes", () => {
  it("is the soonest of a wait ending, a reading turning a day old, an entry dated ahead, and midnight", () => {
    const midnight = new Date(NOW); midnight.setHours(24, 0, 0, 0);
    const soon = Math.min(NOW.getTime() + 180 * 60000, midnight.getTime());
    expect(healthLineChangesAt([dose(60)], "b1", NOW)).toBe(soon);
    expect(healthLineChangesAt([temp(23 * 60 + 50, 3800)], "b1", NOW)).toBe(Math.min(NOW.getTime() + 10 * 60000, midnight.getTime()));
    expect(healthLineChangesAt([dose(-5, { repeat_after_min: null })], "b1", NOW)).toBe(NOW.getTime() + 5 * 60000);
    expect(healthLineChangesAt([], "b1", NOW)).toBeNull();
  });
});

describe("which times count", () => {
  it("any ISO time with seconds and a zone, as the mobile widget reads it; one with no zone is left out", () => {
    expect(latestTemperature([temp(0, 3700, { started_at: "2026-10-29T19:30:00+02:00" })], "b1", NOW).temp_c100).toBe(3700);
    expect(latestTemperature([temp(0, 3700, { started_at: "2026-10-29T17:30:00" })], "b1", NOW)).toBeNull();
    expect(nextDoses([dose(0, { started_at: "2026-10-29T17:00:00.1234Z" })], "b1", NOW)[0].givenAt).toBe("2026-10-29T17:00:00.1234Z");
  });
});

describe("search", () => {
  it("finds a temperature by the number shown, in either units, and by \"fever\"", () => {
    const f = searchableFields(temp(0, 3844));
    expect(f).toEqual(expect.arrayContaining(["38.4 °C", "101.2 °F", "fever"]));
    expect(searchableFields(temp(0, 3700))).not.toContain("fever");
  });
});

describe("manifest", () => {
  it("a reading and how it was taken are plaintext (Siri binds the reading as text); the medicine and its dose stay encrypted", () => {
    expect(manifest.db_plaintext_columns).toEqual(expect.arrayContaining(["temp_method", "temp_c100"]));
    expect(manifest.db_plaintext_columns).not.toContain("med_name");
    expect(manifest.db_plaintext_columns).not.toContain("med_dose");
  });
  it("the reports project the medicine and dose as columns of their own, never inside an expression", () => {
    for (const v of manifest.reports.views) {
      for (const col of ["med_name", "med_dose"]) {
        const uses = v.source.query.match(new RegExp(`[^\\s,]*\\b${col}\\b[^,]*`, "g")) ?? [];
        for (const u of uses) expect(u.trim(), `${v.id}: ${col}`).toMatch(new RegExp(`^e\\.${col} AS \\w+$`));
      }
    }
  });
  it("the reports mark a fever on the exact bound, 38.0 °C", () => {
    for (const v of manifest.reports.views) {
      for (const bound of v.source.query.match(/temp_c100 >= \d+/g) ?? []) expect(bound, v.id).toBe("temp_c100 >= 3800");
    }
  });
  it("no reminder is ever sent for a medicine", () => {
    expect(JSON.stringify(manifest.interval_reminders)).not.toMatch(/medicine/);
  });
});
