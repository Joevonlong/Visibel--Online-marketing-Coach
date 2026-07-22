// ISS-032 regression guard. FEA-112 made image generation outlive the audit:
// the report reaches `status: "complete"` in ~33s and the images stream in
// afterwards. The poller treated "complete" as "nothing left to watch", so the
// finished images only appeared after a manual page reload.
import { describe, expect, it } from "vitest";

import { imagesPending, nextPollDelayMs } from "../lib/client/poll";
import type { AuditPollResponse } from "../lib/client/types";

function response(overrides: Partial<AuditPollResponse> = {}): AuditPollResponse {
  return {
    status: "complete",
    execution_mode: "LIVE",
    progress: [],
    report: null,
    channels: null,
    preview_ready: true,
    overall_score: 61,
    ...overrides,
  } as AuditPollResponse;
}

describe("ISS-032 — the page keeps watching while images are in flight", () => {
  it("treats a complete audit with pending images as still live", () => {
    expect(imagesPending(response({ images_pending: 2 }))).toBe(true);
    // 3s: relaxed, but far from the 5s idle cadence — and never "stop".
    expect(nextPollDelayMs(response({ images_pending: 2 }))).toBe(3000);
  });

  it("goes idle only once nothing is left to wait for", () => {
    expect(imagesPending(response({ images_pending: 0 }))).toBe(false);
    expect(nextPollDelayMs(response({ images_pending: 0 }))).toBe(5000);
    // A payload from before FEA-112 carries no counter at all — absent must
    // not be read as "still pending" or the page would poll forever.
    expect(imagesPending(response())).toBe(false);
    expect(nextPollDelayMs(response())).toBe(5000);
  });

  it("keeps the fast cadence while the pipeline itself is running", () => {
    expect(nextPollDelayMs(response({ status: "analyzing", images_pending: 0 }))).toBe(1000);
    // Pending images must not slow down a genuinely running pipeline.
    expect(nextPollDelayMs(response({ status: "improving", images_pending: 3 }))).toBe(1000);
  });

  it("polls fast when it has no data yet", () => {
    expect(nextPollDelayMs(null)).toBe(1000);
  });

  it("stays live while a channel is improving even with no counter", () => {
    const channels = [{ id: "hero_image", status: "improving" }] as unknown as AuditPollResponse["channels"];
    expect(nextPollDelayMs(response({ channels }))).toBe(1000);
  });
});
