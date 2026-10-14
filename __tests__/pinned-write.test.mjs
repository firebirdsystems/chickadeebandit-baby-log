import { describe, it, expect } from "vitest";
import { unchangedWriteLine, outcomeUnknown, storedDiffers } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);
const words = { action: "delete the entry", thing: "entry" };

describe("unchangedWriteLine", () => {
  it("says removed when the re-read finds no row", () => {
    expect(unchangedWriteLine(true, words)).toBe("This entry has been removed.");
  });
  it("says permission when the row is still there after a plain WHERE id = ? write", () => {
    expect(unchangedWriteLine(false, words)).toBe("You don’t have permission to delete the entry.");
  });
  it("asks for a retry only when the re-read failed", () => {
    expect(unchangedWriteLine(undefined, words)).toBe("Couldn’t delete the entry — try again.");
  });
});

describe("outcomeUnknown", () => {
  it("is unknown with no status, a 400, or a 5xx other than 507", () => {
    for (const e of [new TypeError("Failed to fetch"), err({ status: 0 }), err({ status: 400 }), err({ status: 500 }), err({ status: 503 })]) {
      expect(outcomeUnknown(e)).toBe(true);
    }
  });
  it("is known for a refusal", () => {
    for (const e of [err({ status: 403 }), err({ status: 404 }), err({ status: 409 }), err({ status: 507 })]) {
      expect(outcomeUnknown(e)).toBe(false);
    }
  });
  it("reads back on a duplicate: a retry that landed collides on its own pinned id", () => {
    for (const e of [err({ status: 400, code: "UNIQUE_CONSTRAINT" }), err({ status: 400 }, "UNIQUE constraint failed: x.id")]) {
      expect(outcomeUnknown(e)).toBe(true);
    }
  });
});

describe("storedDiffers", () => {
  const fields = { entry_type: "feed", amount_ml: 120, note: "", ended_at: null };
  it("treats a stored row matching the form as the same, as text", () => {
    expect(storedDiffers({ id: "x", entry_type: "feed", amount_ml: "120", note: null, ended_at: null }, fields)).toBe(false);
  });
  it("sees an edit made since the first try", () => {
    expect(storedDiffers({ entry_type: "feed", amount_ml: 90, note: "", ended_at: null }, fields)).toBe(true);
  });
});
