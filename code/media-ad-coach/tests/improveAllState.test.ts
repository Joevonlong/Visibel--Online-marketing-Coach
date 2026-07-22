// FEA-111 — the global "Do It All For You" button must report progress and
// failures that are true. These tests pin the two ways it could lie: claiming
// a run finished while the engine is still working, and quietly counting an
// item the engine gave up on as done.
import { describe, expect, it } from "vitest";

import {
  computeImproveAll,
  improveAllLabel,
  improveAllSummary,
  selectImprovableIds,
} from "../components/report/improveAllState";
import type { Channel } from "../lib/schemas";

function channel(id: string, status: Channel["status"]): Channel {
  return {
    id: id as Channel["id"],
    lane: "text",
    title: id,
    one_liner: "",
    priority: 1,
    severity: "medium",
    status,
    finding_ids: [],
    before: null,
    after: null,
  } as unknown as Channel;
}

describe("FEA-111 — one-click optimize-all state", () => {
  it("targets every unfinished channel except the disabled promo_video row", () => {
    const channels = [
      channel("hero_copy", "todo"),
      channel("cta_contact", "improved"),
      channel("promo_video", "coming_soon"),
      channel("hero_image", "todo"),
    ];
    expect(selectImprovableIds(channels)).toEqual(["hero_copy", "hero_image"]);
  });

  it("stays idle when no run was launched from this button", () => {
    const progress = computeImproveAll({
      targets: null,
      channels: [channel("hero_copy", "improving")],
      auditStatus: "improving",
      requestPending: false,
    });
    expect(progress.phase).toBe("idle");
  });

  it("counts only really-improved channels while the engine works", () => {
    const targets = ["hero_copy", "cta_contact", "hero_image"];
    const progress = computeImproveAll({
      targets,
      channels: [
        channel("hero_copy", "improved"),
        channel("cta_contact", "improving"),
        channel("hero_image", "todo"),
      ],
      auditStatus: "improving",
      requestPending: false,
    });
    expect(progress.phase).toBe("running");
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    // No failure may be declared before the run settles.
    expect(progress.failedIds).toEqual([]);
    expect(improveAllLabel(progress, 3)).toBe("Optimizing… 1 of 3 done");
    expect(improveAllSummary(progress)).toBeNull();
  });

  it("does not fall back to idle in the gap between the click and the first poll tick", () => {
    const progress = computeImproveAll({
      targets: ["hero_copy"],
      // The poller has not yet seen the flip to "improving".
      channels: [channel("hero_copy", "todo")],
      auditStatus: "scored",
      requestPending: true,
    });
    expect(progress.phase).toBe("running");
  });

  it("reports the channels the engine gave up on as failed, not as done", () => {
    const progress = computeImproveAll({
      targets: ["hero_copy", "cta_contact", "hero_image"],
      channels: [
        channel("hero_copy", "improved"),
        channel("cta_contact", "improved"),
        // The orchestrator resets a channel it could not improve back to todo.
        channel("hero_image", "todo"),
      ],
      auditStatus: "complete",
      requestPending: false,
    });
    expect(progress.phase).toBe("summary");
    expect(progress.done).toBe(2);
    expect(progress.failedIds).toEqual(["hero_image"]);
    expect(improveAllLabel(progress, 1)).toBe("Retry 1 unfinished");
    expect(improveAllSummary(progress)).toContain("2 done · 1 could not be finished");
  });

  it("closes cleanly when everything succeeded", () => {
    const progress = computeImproveAll({
      targets: ["hero_copy"],
      channels: [channel("hero_copy", "improved")],
      auditStatus: "complete",
      requestPending: false,
    });
    expect(progress.failedIds).toEqual([]);
    expect(improveAllSummary(progress)).toBe("That improvement is done.");
    expect(improveAllLabel(progress, 0)).toBe("Everything is optimized");
  });
});
