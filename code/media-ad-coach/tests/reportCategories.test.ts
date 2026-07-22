import { describe, expect, it } from "vitest";

import {
  CATEGORY_ORDER,
  categoryOfChannel,
  groupChannelsByCategory,
} from "../lib/client/reportCategories";
import type { Channel } from "../lib/schemas";

function channel(id: string): Channel {
  return {
    id: id as Channel["id"],
    lane: "text",
    title: id,
    one_liner: "",
    priority: 0,
    severity: "low",
    status: "todo",
    finding_ids: [],
    before: null,
    after: null,
  };
}

describe("categoryOfChannel", () => {
  it("routes each channel to its module", () => {
    expect(categoryOfChannel("platform_consistency")).toBe("gbp");
    expect(categoryOfChannel("hero_headline")).toBe("website");
    expect(categoryOfChannel("optimized_site")).toBe("website");
    expect(categoryOfChannel("work_proof_images")).toBe("photos");
    expect(categoryOfChannel("promo_video")).toBe("photos");
  });

  it("falls back to website for an unknown id", () => {
    expect(categoryOfChannel("something_new")).toBe("website");
  });
});

describe("groupChannelsByCategory", () => {
  it("buckets channels and preserves order within a bucket", () => {
    const groups = groupChannelsByCategory([
      channel("hero_headline"),
      channel("platform_consistency"),
      channel("cta_contact"),
      channel("team_image"),
    ]);
    expect(groups.gbp.map((c) => c.id)).toEqual(["platform_consistency"]);
    expect(groups.website.map((c) => c.id)).toEqual(["hero_headline", "cta_contact"]);
    expect(groups.photos.map((c) => c.id)).toEqual(["team_image"]);
    expect(groups.search).toEqual([]);
  });

  it("returns all four buckets even when empty", () => {
    const groups = groupChannelsByCategory([]);
    expect(Object.keys(groups).sort()).toEqual([...CATEGORY_ORDER].sort());
  });
});
