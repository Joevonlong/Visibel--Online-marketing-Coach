// ISS-029 regression guard: the After page must never present a photo
// harvested from the business's OWN current website as if it were an
// optimization result — that photo also appears on the Before side, so an
// unbadged, unexplained render makes the two halves look identical while the
// right one claims to be the improvement.
import { describe, expect, it } from "vitest";

import {
  EMPTY_AFTER_IMAGE_META,
  readAfterImageMeta,
  resolveAfterImageSource,
} from "../components/preview/afterImageState";

describe("ISS-029 — After-page image truth", () => {
  it("treats an unlabelled image as a harvested fallback, not as generated output", () => {
    expect(resolveAfterImageSource(true, null)).toBe("harvested_fallback");
    expect(resolveAfterImageSource(true, undefined)).toBe("harvested_fallback");
  });

  it("treats a labelled image as generated output", () => {
    expect(resolveAfterImageSource(true, "ai_concept")).toBe("generated");
    expect(resolveAfterImageSource(true, "enhanced")).toBe("generated");
  });

  it("reports an empty slot so the block renders a placeholder instead of vanishing", () => {
    expect(resolveAfterImageSource(false, "ai_concept")).toBe("none");
    expect(resolveAfterImageSource(false, null)).toBe("none");
  });

  it("lets an explicit backend declaration override the label heuristic", () => {
    // Backend says "harvested_fallback" even though a label survived on the
    // asset row — the declaration is the stronger signal.
    expect(
      resolveAfterImageSource(true, "ai_concept", {
        declaredSource: "harvested_fallback",
        generationErrorReason: "Image generation failed: timed out after 120000ms",
        generationPending: false,
      })
    ).toBe("harvested_fallback");
    expect(
      resolveAfterImageSource(true, null, {
        declaredSource: "generated",
        generationErrorReason: null,
        generationPending: false,
      })
    ).toBe("generated");
  });

  it("reads the optional ISS-028 fields off a raw preview blob and tolerates their absence", () => {
    expect(readAfterImageMeta(null)).toEqual(EMPTY_AFTER_IMAGE_META);
    expect(readAfterImageMeta({ hero: {}, about_team: {} })).toEqual(EMPTY_AFTER_IMAGE_META);

    const meta = readAfterImageMeta({
      hero: {
        image_source: "harvested_fallback",
        generation_error_reason: "Image generation failed: timed out after 120000ms",
      },
      about_team: { image_source: "generated" },
    });
    expect(meta.hero.declaredSource).toBe("harvested_fallback");
    expect(meta.hero.generationErrorReason).toContain("timed out");
    expect(meta.team.declaredSource).toBe("generated");
    expect(meta.team.generationErrorReason).toBeNull();
  });

  it("ignores an unrecognized image_source value rather than trusting it", () => {
    const meta = readAfterImageMeta({ hero: { image_source: "magic" } });
    expect(meta.hero.declaredSource).toBeNull();
  });
});

describe("ISS-032 — a streamed partial announces itself", () => {
  it("reads generation_pending off the preview payload", () => {
    const meta = readAfterImageMeta({
      hero: { image_source: "generated", generation_pending: true },
      about_team: { image_source: "generated" },
    });
    expect(meta.hero.generationPending).toBe(true);
    expect(meta.team.generationPending).toBe(false);
  });

  it("does not change what the slot IS — a pending image is still generated", () => {
    expect(
      resolveAfterImageSource(true, "ai_concept", {
        declaredSource: "generated",
        generationErrorReason: null,
        generationPending: true,
      })
    ).toBe("generated");
  });

  it("defaults to not-pending on legacy payloads", () => {
    expect(readAfterImageMeta({ hero: {}, about_team: {} }).hero.generationPending).toBe(false);
    expect(EMPTY_AFTER_IMAGE_META.hero.generationPending).toBe(false);
  });
});
