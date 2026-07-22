// ISS-030 regression guard: raw image-pipeline errors are diagnostics, not UI
// copy. The strings below are the real shapes lib/improve/orchestrate.ts and
// lib/improve/image.ts write into `generation_error` / `edit_error`.
import { describe, expect, it } from "vitest";

import {
  classifyGenerationFailure,
  imageEditFailureCopy,
  imageGenerationFailureCopy,
  redactChannelAfter,
  redactGenerationError,
} from "../components/report/generationStatus";

const RAW_SAMPLES = [
  "Image generation failed: Request timed out after 120000ms",
  "Image generation failed: 429 Rate limit reached for images in organization org-abc123",
  "Image generation failed: 400 Your request was rejected as a result of our safety system",
  "Image edit failed: 401 Incorrect API key provided: sk-proj-**********",
  "Image generation failed: read ECONNRESET at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20)",
];

describe("ISS-030 — image failure copy is allowlisted", () => {
  it("never echoes any part of the raw provider string", () => {
    for (const raw of RAW_SAMPLES) {
      for (const copy of [imageGenerationFailureCopy(raw), imageEditFailureCopy(raw)]) {
        // The tell-tale fragments that leaked before the fix.
        expect(copy).not.toContain("120000");
        expect(copy).not.toContain("429");
        expect(copy).not.toContain("401");
        expect(copy).not.toContain("sk-");
        expect(copy).not.toContain("org-");
        expect(copy).not.toContain("node:internal");
        expect(copy).not.toContain("failed:");
        // And nothing longer than a sentence or two can slip through.
        expect(copy.length).toBeLessThan(140);
      }
    }
  });

  it("classifies the failure shapes the pipeline actually produces", () => {
    expect(classifyGenerationFailure(RAW_SAMPLES[0])).toBe("timeout");
    expect(classifyGenerationFailure(RAW_SAMPLES[1])).toBe("rate_limited");
    expect(classifyGenerationFailure(RAW_SAMPLES[2])).toBe("content_policy");
    expect(classifyGenerationFailure(RAW_SAMPLES[3])).toBe("auth");
    expect(classifyGenerationFailure(RAW_SAMPLES[4])).toBe("unknown");
  });

  it("falls back to neutral copy for anything unrecognized, including non-strings", () => {
    for (const input of [null, undefined, 42, {}, "", "something entirely new"]) {
      expect(classifyGenerationFailure(input)).toBe("unknown");
      expect(imageGenerationFailureCopy(input)).toBe(
        "This image couldn't be generated this time — you can retry it."
      );
    }
  });

  it("tells the user their original photo is safe when an EDIT fails", () => {
    for (const raw of RAW_SAMPLES) {
      expect(imageEditFailureCopy(raw).toLowerCase()).toContain("original");
    }
  });
});

describe("ISS-030 — raw provider text never crosses to the browser", () => {
  it("replaces the error field with a classified token before serialization", () => {
    const after = {
      generated_asset_id: null,
      best_existing_asset_id: "asset-1",
      generation_error: "Image generation failed: 401 Incorrect API key provided: sk-proj-**********",
    };
    const redacted = redactChannelAfter(after) as Record<string, unknown>;
    expect(redacted.generation_error).toBe("auth");
    expect(JSON.stringify(redacted)).not.toContain("sk-");
    // Untouched fields survive.
    expect(redacted.best_existing_asset_id).toBe("asset-1");
  });

  it("round-trips: the redacted token still selects the right copy on the client", () => {
    const token = redactGenerationError("Image generation failed: Request timed out after 120000ms");
    expect(token).toBe("timeout");
    expect(imageGenerationFailureCopy(token)).toBe(
      "This image took too long to generate and was stopped. You can try it again."
    );
  });

  it("leaves an after-blob with no error field alone", () => {
    const after = { generated_asset_id: "asset-9" };
    expect(redactChannelAfter(after)).toBe(after);
    expect(redactChannelAfter(null)).toBeNull();
  });
});
