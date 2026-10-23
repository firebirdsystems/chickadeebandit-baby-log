import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });
  it("entrypoint/runtime/storage are standard", () => {
    expect(manifest.entrypoint).toBe("index.html");
    expect(manifest.runtime).toBe("static");
    expect(manifest.storage).toBe("db");
  });
  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));
  it("has a nav label", () => expect(manifest.nav?.label).toBeTruthy());

  it("adults manage the children; everyone logs entries and shifts under their own stamped name", () => {
    expect(manifest.row_policies?.babies?.kind).toBe("adult_writable");
    for (const table of ["entries", "shifts"]) {
      const p = manifest.row_policies?.[table];
      expect(p?.kind, table).toBe("owner_or_visibility");
      expect(p?.visibility_column, table).toBe("visibility");
      expect(p?.everyone_values, table).toEqual(["everyone"]);
      expect(p?.write_visibility_scoped, table).toBe(true);
      expect(p?.delete_adult_only, table).toBe(true);
      // The stamp and the visibility are the hub's, never the page's.
      expect(p?.column_write_acls?.[p.member_column], table).toEqual({ writable_by: [], actions: ["update"] });
      expect(p?.column_write_acls?.visibility, table).toEqual({ writable_by: [] });
    }
    expect(manifest.row_policies.entries.member_column).toBe("created_by");
    expect(manifest.row_policies.shifts.member_column).toBe("member_id");
  });

  it("a nanny's feed publishes like a parent's", () => {
    expect(manifest.publish_acls?.["baby.entry_logged"]).toEqual({ require_role: "member" });
  });

  it("every stamped column is a member reference kept when the member leaves", () => {
    for (const table of ["babies", "entries", "shifts"]) {
      expect(manifest.member_references?.[table]?.on_removed, table).toBe("keep");
    }
  });

  it("the high-volume entries and shifts tables auto-expire via retention on a plaintext column", () => {
    for (const table of ["entries", "shifts"]) {
      const r = manifest.retention?.[table];
      expect(r?.default, table).toBeGreaterThan(0);
      expect(r?.timestamp_column, table).toBe("started_at");
    }
  });

  it("entry_type is declared plaintext for SQL filtering", () => {
    expect(manifest.db_plaintext_columns).toContain("entry_type");
  });

  it("ai exports match the query files", () => {
    expect(manifest.ai_access?.db_exports?.sort()).toEqual(["babies", "recent_entries"]);
  });
});
