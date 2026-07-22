import { describe, expect, it } from "vitest";

import { extractCurationMeta } from "../lib/client/curationMeta";

describe("extractCurationMeta", () => {
  it("reads reason + group from the backend after_curation object", () => {
    expect(
      extractCurationMeta({
        after_curation: { include: true, group: "credential", reason: "Kept: certificate." },
      })
    ).toEqual({ reason: "Kept: certificate.", group: "credential" });
  });

  it("prefers after_curation.reason over a legacy flat key", () => {
    expect(
      extractCurationMeta({
        selection_reason: "old",
        after_curation: { include: true, group: "real_photo", reason: "new" },
      })
    ).toEqual({ reason: "new", group: "real_photo" });
  });

  it("falls back to legacy flat keys when after_curation is absent", () => {
    expect(extractCurationMeta({ selection_reason: "kept it" })).toEqual({
      reason: "kept it",
      group: null,
    });
    expect(extractCurationMeta({ keep_reason: "kept" }).reason).toBe("kept");
  });

  it("ignores an unknown group and empty reason", () => {
    expect(
      extractCurationMeta({ after_curation: { group: "banana", reason: "   " } })
    ).toEqual({ reason: null, group: null });
  });

  it("degrades to nulls for missing/non-object meta", () => {
    expect(extractCurationMeta(null)).toEqual({ reason: null, group: null });
    expect(extractCurationMeta("nope")).toEqual({ reason: null, group: null });
    expect(extractCurationMeta({})).toEqual({ reason: null, group: null });
  });
});
