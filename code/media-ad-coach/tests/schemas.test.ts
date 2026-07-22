import { describe, expect, it } from "vitest";
import {
  Asset,
  BusinessInput,
  Channel,
  ChannelId,
  FixtureAudit,
  PreviewJson,
  Report,
  RewriteOutput,
} from "../lib/schemas";
import fixture from "../lib/fixtures/replay-audit.json";

const CATALOG_IDS = [
  "hero_headline",
  "business_description",
  "services_copy",
  "cta_contact",
  "legal_footer",
  "platform_consistency",
  "hero_image",
  "work_proof_images",
  "team_image",
  "image_fixes",
  "optimized_site",
  "promo_video",
] as const;

describe("Report schema", () => {
  it("parses the REPLAY fixture's report field", () => {
    const result = Report.parse(fixture.report);
    expect(result.execution_mode).toBe("REPLAY");
    expect(result.band).toBe(fixture.report.band);
    expect(result.overall_score).toBe(fixture.report.overall_score);
    expect(result.findings.length).toBeGreaterThanOrEqual(8);
    // optimized_site pinned first, promo_video pinned last (plan §2.5).
    expect(result.channels[0]?.id).toBe("optimized_site");
    expect(result.channels[result.channels.length - 1]?.id).toBe("promo_video");
  });

  it("rejects a channel whose id is outside the fixed 12-channel catalog", () => {
    const tampered = {
      ...fixture.report,
      channels: [
        { ...fixture.report.channels[0], id: "not_a_real_channel" },
        ...fixture.report.channels.slice(1),
      ],
    };
    expect(Report.safeParse(tampered).success).toBe(false);
  });

  it("rejects a report missing a required field (execution_mode)", () => {
    const { execution_mode: _drop, ...withoutMode } = fixture.report as Record<string, unknown>;
    expect(Report.safeParse(withoutMode).success).toBe(false);
  });
});

describe("ChannelId", () => {
  it("accepts every catalog id", () => {
    for (const id of CATALOG_IDS) {
      expect(ChannelId.safeParse(id).success).toBe(true);
    }
  });

  it("rejects an id outside the fixed catalog", () => {
    expect(ChannelId.safeParse("video_ads").success).toBe(false);
  });
});

describe("Channel schema", () => {
  it("rejects a bad channel id even with an otherwise valid row", () => {
    const badChannel = {
      ...fixture.report.channels[0],
      id: "totally_made_up_channel",
    };
    expect(Channel.safeParse(badChannel).success).toBe(false);
  });
});

describe("BusinessInput", () => {
  it("parses the fixture's business object", () => {
    expect(BusinessInput.safeParse(fixture.business).success).toBe(true);
  });

  it("rejects an unknown trade value", () => {
    const bad = { ...fixture.business, trade: "carpenter" };
    expect(BusinessInput.safeParse(bad).success).toBe(false);
  });
});

describe("Asset schema", () => {
  it("parses every asset row in the fixture", () => {
    for (const asset of fixture.assets) {
      expect(Asset.safeParse(asset).success).toBe(true);
    }
  });
});

describe("RewriteOutput", () => {
  it("accepts a valid hero_headline rewrite", () => {
    const result = RewriteOutput.safeParse({
      channel_id: "hero_headline",
      before_excerpt: "Sanitär Krause",
      after: {
        h1: "Sanitär Krause Berlin — Ihr Klempner in 24h",
        subline: "Familienbetrieb seit 1998, Bad & Heizung, Berlin-weit.",
        cta_text: "Jetzt anrufen",
      },
      rationale_one_liner: "Adds trade, area, and urgency to the first thing a visitor sees.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a channel id outside the 6 text-rewrite channels", () => {
    const result = RewriteOutput.safeParse({
      channel_id: "hero_image",
      before_excerpt: "x",
      after: {},
      rationale_one_liner: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects the wrong 'after' shape for a known channel", () => {
    const result = RewriteOutput.safeParse({
      channel_id: "hero_headline",
      before_excerpt: "x",
      after: { services: [] }, // services_copy's shape, not hero_headline's
      rationale_one_liner: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("FixtureAudit", () => {
  it("parses the whole fixture file end to end", () => {
    const result = FixtureAudit.safeParse(fixture);
    expect(result.success).toBe(true);
    if (result.success) {
      // F-082: the full REPLAY fixture records a real preview_json, not the
      // F-081 skeleton's null — tests/fixture.test.ts covers its shape in
      // depth; this just re-confirms FixtureAudit accepts it end to end.
      expect(result.data.preview_json).not.toBeNull();
      expect(result.data.assets.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ISS-031 — the ISS-028 provenance fields must SURVIVE a PreviewJson parse
// ---------------------------------------------------------------------------

/** Minimal valid PreviewJson carrying the ISS-028 provenance fields. */
function previewWithProvenance(overrides: {
  heroSource?: unknown;
  heroReason?: unknown;
  gallerySource?: unknown;
} = {}) {
  return {
    header: { business_name: "Sanitär Krause" },
    hero: {
      h1: "h",
      subline: "s",
      cta_text: "c",
      hero_image_ref: "asset-1",
      image_source: overrides.heroSource ?? "harvested_fallback",
      generation_error_reason: overrides.heroReason ?? "timeout",
    },
    trust_bar: { years_in_business: null, certifications: [], review_chip: null },
    services: [
      { title: "a", description: "d" },
      { title: "b", description: "d" },
      { title: "c", description: "d" },
    ],
    gallery: [{ asset_ref: "asset-1", label: null, image_source: overrides.gallerySource ?? "harvested_fallback" }],
    about_team: { text: "t", team_image_ref: "asset-1", image_source: "generated" },
    contact: { cta: "c" },
    legal_footer: { impressum: null, datenschutz: null },
    what_changed: [],
    before: { sections: [], original_image_refs: [] },
  };
}

describe("PreviewJson provenance fields (ISS-028/ISS-031)", () => {
  it("keeps image_source and generation_error_reason through a parse — a stripped field would make the After page dishonest again", () => {
    const parsed = PreviewJson.safeParse(previewWithProvenance());

    expect(parsed.success).toBe(true);
    expect(parsed.data!.hero.image_source).toBe("harvested_fallback");
    expect(parsed.data!.hero.generation_error_reason).toBe("timeout");
    expect(parsed.data!.about_team.image_source).toBe("generated");
    expect(parsed.data!.gallery[0]!.image_source).toBe("harvested_fallback");
  });

  it("stays absent (not invented) when the assembler never set it", () => {
    const bare = previewWithProvenance();
    delete (bare.hero as Record<string, unknown>).image_source;
    delete (bare.hero as Record<string, unknown>).generation_error_reason;

    const parsed = PreviewJson.safeParse(bare);

    expect(parsed.success).toBe(true);
    expect(parsed.data!.hero.image_source).toBeUndefined();
    expect(parsed.data!.hero.generation_error_reason).toBeUndefined();
  });

  it("ISS-031: an unrecognized provenance value degrades instead of invalidating the whole preview", () => {
    // A stored blob can hold a raw provider message (e.g. a hand-edited demo
    // row) — that must never cut the preview F-054 promises is never cut.
    const parsed = PreviewJson.safeParse(
      previewWithProvenance({
        heroReason: "Image generation timed out after 120000ms",
        heroSource: "something_else",
        gallerySource: 42,
      }),
    );

    expect(parsed.success).toBe(true);
    expect(parsed.data!.hero.generation_error_reason).toBe("unknown");
    expect(parsed.data!.hero.image_source).toBeUndefined();
    expect(parsed.data!.gallery[0]!.image_source).toBeUndefined();
    // The raw provider text never survives the parse.
    expect(JSON.stringify(parsed.data)).not.toContain("120000ms");
  });
});
