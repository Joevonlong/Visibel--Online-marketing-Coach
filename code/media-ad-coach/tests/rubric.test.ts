import { describe, expect, it } from "vitest";
import fixture from "../lib/fixtures/replay-audit.json";
import type {
  Asset,
  BusinessInput,
  Criterion,
  CopyStrategistOutput,
  GbpEvidence,
  PortalEvidence,
  TavilyFindability,
  VisualDirectorOutput,
  WebsiteEvidence,
} from "../lib/schemas";
import {
  bandFor,
  buildReport,
  computeNapConsistency,
  imageLaneScore,
  normalizeAddress,
  normalizePhone,
  overallScore,
  textLaneScore,
  type BuildReportInput,
} from "../lib/rubric";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function crit(id: string, score: number, evidence = `${id} evidence`, source: Criterion["source"] = "fetched"): Criterion {
  return { id, score, evidence, source };
}

function makeBusiness(overrides: Partial<BusinessInput> = {}): BusinessInput {
  return {
    brand_name: "Test Business",
    trade: "plumber",
    presence: {},
    ...overrides,
  };
}

function makeFindability(): TavilyFindability {
  return { status: "not_found", results: [], source: "tavily" };
}

function makeWebsiteEvidence(overrides: Partial<WebsiteEvidence> = {}): WebsiteEvidence {
  return {
    source: "fetched",
    https: true,
    title: null,
    h1: null,
    meta_description: null,
    has_viewport_meta: true,
    tel_links: [],
    visible_text: [],
    nav_links: [],
    has_impressum: true,
    has_datenschutz: true,
    img_candidates: [],
    ...overrides,
  };
}

function makeAsset(id: string, kind: Asset["kind"] = "harvested_image"): Asset {
  return {
    id,
    audit_id: "audit-1",
    kind,
    source: null,
    storage_path: null,
    meta: null,
    score: null,
    label: null,
    status: "ready",
  };
}

function baseInput(overrides: Partial<BuildReportInput> = {}): BuildReportInput {
  return {
    business: makeBusiness(),
    websiteEvidence: null,
    portals: [],
    gbp: null,
    findability: makeFindability(),
    copyOutput: null,
    visualOutput: null,
    assets: [],
    executionMode: "LIVE",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// F-011/F-012 · exact-total arithmetic (hand-computed)
// ---------------------------------------------------------------------------

describe("textLaneScore / imageLaneScore / overallScore — exact totals", () => {
  it("computes the exact hand-worked total for a fixed set of text sub-scores", () => {
    // Weights: T1 20, T2 15, T3 15, T4 15, T5 10, T6 10, T7 10, T8 5.
    // Scores:  T1 3,  T2 0,  T3 4,  T4 2,  T5 5,  T6 1,  T7 3,  T8 2.
    // (3/5*20)=12 + (0/5*15)=0 + (4/5*15)=12 + (2/5*15)=6 + (5/5*10)=10
    //   + (1/5*10)=2 + (3/5*10)=6 + (2/5*5)=2  ->  12+0+12+6+10+2+6+2 = 50
    const criteria = [
      crit("T1", 3),
      crit("T2", 0),
      crit("T3", 4),
      crit("T4", 2),
      crit("T5", 5),
      crit("T6", 1),
      crit("T7", 3),
      crit("T8", 2),
    ];
    expect(textLaneScore(criteria)).toBe(50);
  });

  it("computes the exact hand-worked total for a fixed set of image sub-scores across 2 assets", () => {
    // Weights: I1 20, I2 20, I3 20, I4 15, I5 15, I6 10.
    // Asset A: I1 5, I2 4, I3 3, I4 2, I5 1, I6 0.
    // Asset B: I1 1, I2 2, I3 3, I4 4, I5 5, I6 0.
    // Per-criterion average across assets: I1 3, I2 3, I3 3, I4 3, I5 3, I6 0.
    // (3/5*20)=12 + (3/5*20)=12 + (3/5*20)=12 + (3/5*15)=9 + (3/5*15)=9 + (0/5*10)=0
    //   -> 12+12+12+9+9+0 = 54
    const criteriaByAsset = {
      "asset-a": [crit("I1", 5), crit("I2", 4), crit("I3", 3), crit("I4", 2), crit("I5", 1), crit("I6", 0)],
      "asset-b": [crit("I1", 1), crit("I2", 2), crit("I3", 3), crit("I4", 4), crit("I5", 5), crit("I6", 0)],
    };
    expect(imageLaneScore(criteriaByAsset)).toBe(54);
  });

  it("computes overall = round(50% text + 50% image) from the two totals above", () => {
    // round(0.5*50 + 0.5*54) = round(25 + 27) = round(52) = 52 -> band "At Risk" (50-69).
    const result = overallScore(50, 54);
    expect(result.overall_score).toBe(52);
    expect(result.band).toBe("At Risk");
  });

  it("reproduces the REPLAY fixture's exact text/image/overall totals from its own criteria", () => {
    // Independent regression check against the current real-LIVE-recorded
    // fixture. The expected totals come from its criterion evidence, rather
    // than preserving the old authored sample's literal scores.
    const report = fixture.report as unknown as {
      text: { score: number; criteria: Criterion[] };
      images: { score: number; criteria_by_asset: Record<string, Criterion[]> };
      overall_score: number;
      band: string;
    };
    expect(textLaneScore(report.text.criteria)).toBe(report.text.score);
    expect(imageLaneScore(report.images.criteria_by_asset)).toBe(report.images.score);
    const overall = overallScore(report.text.score, report.images.score);
    expect(overall.overall_score).toBe(report.overall_score);
    expect(overall.band).toBe(report.band);
  });
});

// ---------------------------------------------------------------------------
// F-010 · band boundaries
// ---------------------------------------------------------------------------

describe("bandFor — score band boundaries", () => {
  it.each([
    [0, "Invisible"],
    [29, "Invisible"],
    [30, "Weak"],
    [49, "Weak"],
    [50, "At Risk"],
    [69, "At Risk"],
    [70, "Strong"],
    [84, "Strong"],
    [85, "Market Leader"],
    [100, "Market Leader"],
  ])("bandFor(%i) === %s", (score, expected) => {
    expect(bandFor(score)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// F-011/F-013 · missing-evidence -> 0 + channel row
// ---------------------------------------------------------------------------

describe("missing evidence -> score 0 + channel row (F-011/F-013)", () => {
  it("total absence (no text, no images, no portals) scores 0/0/0 and still produces channel rows", () => {
    const report = buildReport(baseInput());

    expect(report.text.score).toBe(0);
    expect(report.images.score).toBe(0);
    expect(report.overall_score).toBe(0);
    expect(report.band).toBe("Invisible");

    // Every T-criterion is present, scored 0, sourced "absent" — never silently dropped.
    expect(report.text.criteria).toHaveLength(8);
    for (const c of report.text.criteria) {
      expect(c.score).toBe(0);
      expect(c.source).toBe("absent");
      expect(c.evidence.length).toBeGreaterThan(0);
    }

    // Absence is a verdict: it still drives channel rows, not just a lower score.
    const ids = report.channels.map((c) => c.id);
    expect(ids).toContain("hero_headline"); // from T1 absence
    expect(ids).toContain("hero_image"); // from forced coverage gap (zero images)
    // No NAP contradiction is possible with 0 comparable sources.
    expect(ids).not.toContain("platform_consistency");
    expect(report.presence_coverage.nap_consistent).toBeNull();

    // Every finding carries real evidence text — never empty.
    for (const f of report.findings) {
      expect(f.evidence_quote.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// F-015/F-016 · channel derivation + priority order (deterministic)
// ---------------------------------------------------------------------------

describe("channel derivation + priority ordering (F-015/F-016)", () => {
  const richInput: BuildReportInput = {
    business: makeBusiness(),
    websiteEvidence: makeWebsiteEvidence(), // impressum/datenschutz both true - no override interference
    portals: [],
    gbp: null,
    findability: makeFindability(),
    copyOutput: {
      criteria: [
        crit("T1", 1), // -> hero_headline, priority 5^2/1 = 25
        crit("T2", 5),
        crit("T3", 1), // -> business_description, priority 2^2/2 = 2
        crit("T4", 5),
        crit("T5", 2), // -> cta_contact, priority 4^2/4 = 4
        crit("T6", 5),
        crit("T7", 5),
        crit("T8", 0), // -> legal_footer, priority 5^2/5 = 5
      ],
      findings: [
        { criterion: "T1", severity: "high", evidence_quote: "Homepage says only the brand name.", impact: 5, effort: 1 },
        { criterion: "T3", severity: "medium", evidence_quote: "One trust sentence, nothing else.", impact: 2, effort: 2 },
        { criterion: "T5", severity: "medium", evidence_quote: "No hours, no contact form.", impact: 4, effort: 4 },
        { criterion: "T8", severity: "high", evidence_quote: "No legal pages at all.", impact: 5, effort: 5 },
      ],
    } satisfies CopyStrategistOutput,
    visualOutput: {
      images: [
        {
          asset_ref: "img-a",
          // Only I1 is low (score 1); severityFromScore(1) = "high" -> default impact 5, effort 2 -> priority 12.5.
          criteria: [crit("I1", 1, "Blurry, underexposed shot.", "vision"), crit("I2", 5), crit("I3", 5), crit("I4", 5), crit("I5", 5), crit("I6", 5)],
        },
      ],
      coverage_gaps: [],
      red_flags: [],
    } satisfies VisualDirectorOutput,
    assets: [makeAsset("img-a")],
    executionMode: "LIVE",
  };

  it("orders middle rows by priority = impact^2/effort, desc, with pinned rows fixed", () => {
    const report = buildReport(richInput);
    const ids = report.channels.map((c) => c.id);
    // Expected priorities: hero_headline 25, image_fixes 12.5, legal_footer 5, cta_contact 4, business_description 2.
    expect(ids).toEqual([
      "optimized_site",
      "hero_headline",
      "image_fixes",
      "legal_footer",
      "cta_contact",
      "business_description",
      "promo_video",
    ]);
  });

  it("is deterministic: identical input produces byte-identical channels and findings on repeat calls", () => {
    const first = buildReport(richInput);
    const second = buildReport(richInput);
    expect(JSON.stringify(second.channels)).toBe(JSON.stringify(first.channels));
    expect(JSON.stringify(second.findings)).toBe(JSON.stringify(first.findings));
  });

  it("breaks priority ties alphabetically by channel id", () => {
    // T2 (-> cta_contact) and T3 (-> business_description) both score 1 with no matching
    // ModelFinding, so both fall back to severity "high" -> impact 5, effort 2 -> priority 12.5 (tied).
    // "business_description" < "cta_contact" alphabetically, so it must sort first.
    const input = baseInput({
      copyOutput: {
        criteria: [crit("T1", 5), crit("T2", 1), crit("T3", 1), crit("T4", 5), crit("T5", 5), crit("T6", 5), crit("T7", 5), crit("T8", 5)],
        findings: [],
      },
      websiteEvidence: makeWebsiteEvidence(),
      // Fully-scored image so the zero-images absence path doesn't add
      // unrelated image channel rows to this text-only tie-break check.
      visualOutput: { images: [{ asset_ref: "img-a", criteria: ["I1", "I2", "I3", "I4", "I5", "I6"].map((id) => crit(id, 5)) }], coverage_gaps: [], red_flags: [] },
      assets: [makeAsset("img-a")],
    });
    const report = buildReport(input);
    const middle = report.channels.filter((c) => c.id !== "optimized_site" && c.id !== "promo_video");
    expect(middle.map((c) => c.id)).toEqual(["business_description", "cta_contact"]);
    expect(middle[0]!.priority).toBe(middle[1]!.priority);
  });
});

// ---------------------------------------------------------------------------
// F-016 · pinning
// ---------------------------------------------------------------------------

describe("pinning (F-016)", () => {
  it("pins optimized_site first and promo_video last (coming_soon) even with zero findings", () => {
    const input = baseInput({
      copyOutput: {
        criteria: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].map((id) => crit(id, 5)),
        findings: [],
      },
      visualOutput: { images: [{ asset_ref: "img-a", criteria: ["I1", "I2", "I3", "I4", "I5", "I6"].map((id) => crit(id, 5)) }], coverage_gaps: [], red_flags: [] },
      assets: [makeAsset("img-a")],
      websiteEvidence: makeWebsiteEvidence(),
    });
    const report = buildReport(input);
    expect(report.channels).toHaveLength(2);
    expect(report.channels[0]!.id).toBe("optimized_site");
    expect(report.channels[0]!.status).toBe("todo");
    expect(report.channels[report.channels.length - 1]!.id).toBe("promo_video");
    expect(report.channels[report.channels.length - 1]!.status).toBe("coming_soon");
  });

  it("keeps the pin even when many other rows exist", () => {
    const report = buildReport(baseInput()); // total-absence case generates ~9 rows
    expect(report.channels[0]!.id).toBe("optimized_site");
    expect(report.channels[report.channels.length - 1]!.id).toBe("promo_video");
  });
});

// ---------------------------------------------------------------------------
// F-017 · NAP normalizer + consistency
// ---------------------------------------------------------------------------

describe("NAP normalizer (F-017)", () => {
  it("normalizePhone treats +49 / 0049 / leading-0 formats as identical", () => {
    const a = normalizePhone("+49 30 1234567");
    const b = normalizePhone("0049-30-1234567");
    const c = normalizePhone("030 1234567");
    expect(a).toBe("49301234567");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("normalizeAddress treats str. / straße as equivalent", () => {
    expect(normalizeAddress("Musterstraße 12, 10115 Berlin")).toBe(normalizeAddress("Musterstr. 12, 10115 Berlin"));
    expect(normalizeAddress("Musterstr. 12, 10115 Berlin")).toBe("musterstrasse 12 10115 berlin");
  });

  it("same phone in 3 formats across website + 2 portals -> consistent, no finding", () => {
    const website = makeWebsiteEvidence({ tel_links: ["tel:+4930 1234567"] });
    const portals: PortalEvidence[] = [
      { platform: "yellow_pages", url: "https://example.com/a", source: "fetched", visible_text: "", phone: "0049-30-1234567" },
      { platform: "check24", url: "https://example.com/b", source: "fetched", visible_text: "", phone: "030 1234567" },
    ];
    const result = computeNapConsistency(website, portals);
    expect(result.nap_consistent).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("genuinely different phone numbers -> high finding + nap_consistent=false", () => {
    const website = makeWebsiteEvidence({ tel_links: ["tel:030 1234567"] });
    const portals: PortalEvidence[] = [
      { platform: "yellow_pages", url: "https://example.com/a", source: "fetched", visible_text: "", phone: "030 9999999" },
    ];
    const result = computeNapConsistency(website, portals);
    expect(result.nap_consistent).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.finding.criterion).toBe("nap_consistency");
    expect(result.findings[0]!.finding.severity).toBe("high");
    expect(result.findings[0]!.finding.evidence_quote.length).toBeGreaterThan(0);
  });

  it("only one source available -> nap_consistent is null (nothing to compare)", () => {
    const website = makeWebsiteEvidence({ tel_links: ["tel:030 1234567"] });
    const result = computeNapConsistency(website, []);
    expect(result.nap_consistent).toBeNull();
    expect(result.findings).toHaveLength(0);
  });

  it("end to end: buildReport surfaces the NAP contradiction as a platform_consistency channel row", () => {
    const website = makeWebsiteEvidence({ tel_links: ["tel:030 1234567"], has_impressum: true, has_datenschutz: true });
    const portals: PortalEvidence[] = [
      { platform: "yellow_pages", url: "https://example.com/a", source: "fetched", visible_text: "", phone: "030 9999999" },
    ];
    const report = buildReport(
      baseInput({
        websiteEvidence: website,
        portals,
        copyOutput: { criteria: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].map((id) => crit(id, 5)), findings: [] },
      }),
    );
    expect(report.presence_coverage.nap_consistent).toBe(false);
    const napChannel = report.channels.find((c) => c.id === "platform_consistency");
    expect(napChannel).toBeDefined();
    expect(napChannel!.severity).toBe("high");
    expect(napChannel!.finding_ids).toContain("f-nap");
  });
});

// ---------------------------------------------------------------------------
// F-013 · Impressum/Datenschutz instant-high T8
// ---------------------------------------------------------------------------

describe("Impressum/Datenschutz missing -> instant high T8 finding (F-013)", () => {
  it("forces a high T8 finding even when the model scored T8 as fine", () => {
    const website = makeWebsiteEvidence({ has_impressum: false, has_datenschutz: true });
    const report = buildReport(
      baseInput({
        websiteEvidence: website,
        copyOutput: {
          criteria: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map((id) => crit(id, 5)).concat(crit("T8", 5)),
          findings: [],
        },
      }),
    );
    const t8 = report.findings.find((f) => f.criterion === "T8");
    expect(t8).toBeDefined();
    expect(t8!.severity).toBe("high");
    expect(t8!.evidence_quote).toContain("Impressum");
    const legalChannel = report.channels.find((c) => c.id === "legal_footer");
    expect(legalChannel).toBeDefined();
    expect(legalChannel!.severity).toBe("high");
    expect(legalChannel!.finding_ids).toContain("f-t8");
  });

  it("names both when both are missing", () => {
    const website = makeWebsiteEvidence({ has_impressum: false, has_datenschutz: false });
    const report = buildReport(baseInput({ websiteEvidence: website, copyOutput: { criteria: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].map((id) => crit(id, 5)), findings: [] } }));
    const t8 = report.findings.find((f) => f.criterion === "T8");
    expect(t8!.evidence_quote).toContain("Impressum");
    expect(t8!.evidence_quote).toContain("Datenschutz");
  });

  it("does not fire when both legal pages are present", () => {
    const website = makeWebsiteEvidence({ has_impressum: true, has_datenschutz: true });
    const report = buildReport(baseInput({ websiteEvidence: website, copyOutput: { criteria: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].map((id) => crit(id, 5)), findings: [] } }));
    expect(report.findings.find((f) => f.criterion === "T8")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F-014/F-029 · zero-images path
// ---------------------------------------------------------------------------

describe("zero-images path (F-014/F-029)", () => {
  it("scores the image lane 0, forces all 4 coverage gaps, and surfaces hero/team/work-proof rows", () => {
    const report = buildReport(baseInput({ assets: [], visualOutput: null }));

    expect(report.images.score).toBe(0);
    expect(report.images.criteria_by_asset["_absent"]).toBeDefined();
    expect(report.images.criteria_by_asset["_absent"]).toHaveLength(6);
    expect(report.images.coverage_gaps.sort()).toEqual(
      ["branding_shot", "hero_shot", "team_shot", "work_proof_shot"].sort(),
    );

    const ids = report.channels.map((c) => c.id);
    expect(ids).toContain("hero_image");
    expect(ids).toContain("team_image");
    expect(ids).toContain("work_proof_images");
    expect(ids).toContain("image_fixes"); // from branding_shot gap + I1/I2/I4/I5/I6 absence

    for (const f of report.findings.filter((f) => f.lane === "image")) {
      expect(f.evidence_quote.length).toBeGreaterThan(0);
      expect(f.asset_ref).toBeNull();
    }
  });

  it("does not affect the text lane score", () => {
    const report = buildReport(
      baseInput({
        websiteEvidence: makeWebsiteEvidence(),
        copyOutput: { criteria: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].map((id) => crit(id, 5)), findings: [] },
        assets: [],
      }),
    );
    expect(report.text.score).toBe(100);
    expect(report.images.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Misc contract checks
// ---------------------------------------------------------------------------

describe("business/gbp passthrough", () => {
  it("derives reputation_chips from gbp evidence when present", () => {
    const gbp: GbpEvidence = { review_count: 12, rating: 4.2, has_photo_reviews: true, source: "manual" };
    const report = buildReport(baseInput({ gbp }));
    expect(report.reputation_chips).toEqual({ review_count: 12, rating: 4.2, has_photo_reviews: true });
  });

  it("falls back to business.gbp_manual when no resolved gbp evidence is given", () => {
    const report = buildReport(
      baseInput({ business: makeBusiness({ gbp_manual: { review_count: 5, rating: 3.9 } }) }),
    );
    expect(report.reputation_chips).toEqual({ review_count: 5, rating: 3.9, has_photo_reviews: null });
  });

  it("is null when no reputation data exists anywhere", () => {
    const report = buildReport(baseInput());
    expect(report.reputation_chips).toBeNull();
  });

  it("presence_coverage reflects which links were provided, independent of fetch success", () => {
    const report = buildReport(
      baseInput({
        business: makeBusiness({
          presence: { website: "https://example.com", maps: "https://maps.example.com", other: ["https://a.com", "https://b.com"] },
        }),
      }),
    );
    expect(report.presence_coverage).toMatchObject({
      website: true,
      maps: true,
      yellow_pages: false,
      other_count: 2,
    });
  });
});
