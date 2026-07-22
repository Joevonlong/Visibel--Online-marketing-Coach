// ISS-033 regression guard. FEA-114 lets the planner DECIDE not to generate an
// image when the business's own photos already cover that category. The report
// rendered that decision as an empty panel — no image, no error, no words —
// which reads as "this failed". It must read as the deliberate, good outcome
// it is, and it must never echo the planner's internal prose.
import { describe, expect, it } from "vitest";

import {
  imageCategoryLabel,
  isSkippedOnPurpose,
  skippedOnPurposeCopy,
} from "../components/report/imageCategory";

// The real string lib/improve/image.ts:608 writes into `skipped_reason`.
const RAW_REASON =
  'work_result is already covered and every other shot-list category for this trade is too — nothing worth generating';

describe("ISS-033 — a deliberate skip is not a failure", () => {
  it("detects a skipped channel from its after blob", () => {
    expect(isSkippedOnPurpose({ skipped_reason: RAW_REASON })).toBe(true);
    expect(isSkippedOnPurpose({ generated_asset_id: "a1" })).toBe(false);
    // Empty / wrong-typed values must not trip it.
    expect(isSkippedOnPurpose({ skipped_reason: "   " })).toBe(false);
    expect(isSkippedOnPurpose({ skipped_reason: 7 })).toBe(false);
    expect(isSkippedOnPurpose(null)).toBe(false);
  });

  it("never echoes the planner's internal prose", () => {
    const copy = skippedOnPurposeCopy("work_result");
    const text = `${copy.title} ${copy.body}`;
    expect(text).not.toContain("work_result");
    expect(text).not.toContain("shot-list");
    expect(text).not.toContain(RAW_REASON);
    // And it says the positive thing.
    expect(copy.title).toBe("Skipped on purpose");
    expect(copy.body).toContain("already cover");
  });

  it("still produces honest copy when the category is missing or unknown", () => {
    for (const input of [undefined, null, "magic_beans", 42]) {
      const copy = skippedOnPurposeCopy(input);
      expect(copy.title).toBe("Skipped on purpose");
      expect(copy.body).toContain("this part of the page");
    }
  });
});

describe("ISS-033 — category chips", () => {
  it("labels every category in the FEA-114 enum", () => {
    expect(imageCategoryLabel("storefront")).toBe("Storefront");
    expect(imageCategoryLabel("team")).toBe("Team");
    expect(imageCategoryLabel("work_result")).toBe("Work result");
    expect(imageCategoryLabel("craft_detail")).toBe("Craft detail");
    expect(imageCategoryLabel("credentials")).toBe("Credentials");
    expect(imageCategoryLabel("equipment")).toBe("Equipment");
    expect(imageCategoryLabel("other")).toBe("Photo");
  });

  it("renders NO chip rather than a wrong one on legacy or unknown values", () => {
    for (const input of [undefined, null, "", "magic_beans", 42, {}]) {
      expect(imageCategoryLabel(input)).toBeNull();
    }
  });
});
