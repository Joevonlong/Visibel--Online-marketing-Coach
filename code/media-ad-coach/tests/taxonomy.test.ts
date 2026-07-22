// FEA-114 regression guards: images are categorized by what they SHOW, page
// slots fill under a per-trade category quota, and the generator only produces
// categories the business does not already have. The defect these pin down:
// four gallery tiles, three of them "the team in front of the van".
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssetRecord } from "../lib/db";
import {
  buildCandidates,
  categoryOf,
  classifyByHeuristic,
  compositionPolicyFor,
  coveredCategories,
  collapseLineages,
  isHeroEditableCategory,
  isKnownUnusableContent,
  lineageRootOf,
  rankRealPhotosForSlot,
  selectGallery,
  selectSlot,
} from "../lib/images/taxonomy";
import type { ImageCategory } from "../lib/schemas";

let dbDir: string;
let storageDir: string;

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), "visibel-taxonomy-db-"));
  storageDir = mkdtempSync(join(tmpdir(), "visibel-taxonomy-storage-"));
  process.env.APP_DB_PATH = join(dbDir, "app.db");
  process.env.APP_STORAGE_DIR = storageDir;
});

afterEach(() => {
  rmSync(dbDir, { recursive: true, force: true });
  rmSync(storageDir, { recursive: true, force: true });
});

async function loadDb() {
  const mod = await import("../lib/db");
  mod.closeDb();
  return mod;
}

function asset(id: string, category: ImageCategory | null, overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id,
    audit_id: "aud",
    kind: "harvested_image",
    source: null,
    storage_path: `images/aud/${id}.jpg`,
    meta_json: {
      width: 900,
      height: 700,
      ...(category ? { content_category: category, content_category_confidence: 0.9, content_category_source: "vision" } : {}),
    },
    score_json: ["I1", "I2", "I3", "I4", "I5", "I6"].map((c) => ({ id: c, score: 4, evidence: "e", source: "vision" })),
    label: null,
    status: "normalized",
    ...overrides,
  };
}

describe("classification (FEA-114)", () => {
  it("reads the persisted vision classification, with its source", () => {
    expect(categoryOf(asset("a", "work_result"))).toEqual({ category: "work_result", confidence: 0.9, source: "vision" });
  });

  it("falls back to keyword heuristics over alt/src/vision evidence when nothing is persisted", () => {
    const team = asset("t", null, { meta_json: { alt: "Unser Team vor dem Firmenwagen" } });
    expect(classifyByHeuristic(team)).toMatchObject({ category: "team", source: "heuristic" });

    const cert = asset("c", null, { meta_json: { alt: "Meisterbrief Urkunde" } });
    expect(classifyByHeuristic(cert)).toMatchObject({ category: "credentials" });
  });

  it("is honestly 'other' rather than force-fitting an unrecognizable image", () => {
    const unknown = asset("u", null, { meta_json: { alt: "IMG_2043" } });
    expect(classifyByHeuristic(unknown)).toMatchObject({ category: "other", source: "heuristic" });
  });
});

describe("gallery composition quota (FEA-114)", () => {
  it("THE BUG: four team photos can no longer fill the gallery — team is capped at one", () => {
    const assets = [
      asset("team1", "team"),
      asset("team2", "team"),
      asset("team3", "team"),
      asset("team4", "team"),
      asset("work1", "work_result"),
      asset("detail1", "craft_detail"),
      asset("shop1", "storefront"),
    ];

    const picked = selectGallery(buildCandidates(assets), compositionPolicyFor("plumber"), 4);

    expect(picked.filter((d) => d.category === "team")).toHaveLength(1);
    expect(picked).toHaveLength(4);
    // Diverse by construction: four slots, four different kinds of picture.
    expect(new Set(picked.map((d) => d.category)).size).toBe(4);
    // And the business-value categories lead.
    expect(picked[0]!.category).toBe("work_result");
  });

  it("allows a category to repeat only up to this trade's quota, best first", () => {
    const assets = [
      asset("w1", "work_result", { score_json: [{ id: "I1", score: 5, evidence: "e", source: "vision" }] }),
      asset("w2", "work_result"),
      asset("w3", "work_result"),
      asset("w4", "work_result"),
      asset("w5", "work_result"),
    ];

    const picked = selectGallery(buildCandidates(assets), compositionPolicyFor("plumber"), 8);

    // plumber inherits the default quota of 3 work_result images.
    expect(picked).toHaveLength(3);
    expect(picked.every((d) => d.category === "work_result")).toBe(true);
  });

  it("never drops this run's own unclassified generated image (new-by-default beats the quota)", () => {
    const assets = [
      asset("gen1", null, { kind: "generated_image", label: "ai_concept", score_json: null }),
      asset("gen2", null, { kind: "generated_image", label: "ai_concept", score_json: null }),
      asset("other1", "other"),
    ];

    const picked = selectGallery(buildCandidates(assets), compositionPolicyFor("plumber"), 8);
    const refs = picked.map((d) => d.asset_id);

    expect(refs).toContain("gen1");
    expect(refs).toContain("gen2");
  });

  it("uses per-trade policy: a doctor's gallery leads with premises, not finished jobs", () => {
    const assets = [asset("w", "work_result"), asset("s", "storefront"), asset("t", "team")];

    const plumber = selectGallery(buildCandidates(assets), compositionPolicyFor("plumber"), 3);
    const doctor = selectGallery(buildCandidates(assets), compositionPolicyFor("doctor"), 3);

    expect(plumber[0]!.category).toBe("work_result");
    expect(doctor[0]!.category).toBe("storefront");
  });

  it("records WHY each slot was filled", () => {
    const picked = selectGallery(buildCandidates([asset("w", "work_result")]), compositionPolicyFor("plumber"), 3);
    expect(picked[0]!.reason).toMatch(/work_result/);
  });
});

describe("slot selection (FEA-114)", () => {
  it("fills the about/team slot with the people and the hero slot with the work", () => {
    const candidates = buildCandidates([asset("t", "team"), asset("w", "work_result")]);
    const policy = compositionPolicyFor("plumber");

    expect(selectSlot(candidates, policy.team_priority, "team")?.asset_id).toBe("t");
    expect(selectSlot(candidates, policy.hero_priority, "hero")?.asset_id).toBe("w");
  });

  it("falls back to the strongest remaining image rather than leaving a slot empty", () => {
    const candidates = buildCandidates([asset("x", "other")]);
    const decision = selectSlot(candidates, compositionPolicyFor("plumber").hero_priority, "hero");
    expect(decision?.asset_id).toBe("x");
  });
});

describe("generation planning (FEA-114)", () => {
  it("THE BUG: a business that already has team photos does not get another team image generated", async () => {
    const db = await loadDb();
    const { planImageGeneration } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });
    db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      status: "normalized",
      meta_json: { content_category: "team", content_category_confidence: 0.9, content_category_source: "vision" },
    });

    const plans = planImageGeneration(audit.id, "plumber", ["hero_image", "team_image", "work_proof_images"]);
    const team = plans.find((p) => p.channelId === "team_image")!;

    expect(team.category).not.toBe("team");
    expect(team.skip).toBe(false);
    expect(team.reason).toMatch(/already covered/);
    // Two channels never claim the same gap.
    expect(new Set(plans.map((p) => p.category)).size).toBe(plans.length);
  });

  it("generates the missing category when nothing covers it", async () => {
    const db = await loadDb();
    const { planImageGeneration } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });

    const plans = planImageGeneration(audit.id, "plumber", ["team_image"]);

    expect(plans[0]).toMatchObject({ category: "team", variant: "team", skip: false });
  });

  it("skips generation entirely — honestly — when every category is already covered", async () => {
    const db = await loadDb();
    const { planImageGeneration } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });
    for (const category of ["work_result", "craft_detail", "team", "storefront"] as const) {
      db.insertAsset({
        audit_id: audit.id,
        kind: "harvested_image",
        status: "normalized",
        meta_json: { content_category: category, content_category_confidence: 0.9, content_category_source: "vision" },
      });
    }

    const plans = planImageGeneration(audit.id, "plumber", ["team_image", "work_proof_images"]);

    expect(plans.every((p) => p.skip)).toBe(true);
    expect(plans[0]!.reason).toMatch(/already covered/);
  });

  it("never plans to generate credentials — an invented certificate would be a lie", async () => {
    const db = await loadDb();
    const { planImageGeneration } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });
    for (const category of ["work_result", "craft_detail", "team", "storefront"] as const) {
      db.insertAsset({
        audit_id: audit.id,
        kind: "harvested_image",
        status: "normalized",
        meta_json: { content_category: category, content_category_confidence: 0.9, content_category_source: "vision" },
      });
    }

    const plans = planImageGeneration(audit.id, "plumber", ["team_image", "work_proof_images"]);
    expect(plans.some((p) => !p.skip && p.category === "credentials")).toBe(false);
  });

  it("coveredCategories ignores generated images by default — a concept is not evidence the business has one", () => {
    const assets = [
      asset("g", null, { kind: "generated_image", meta_json: { content_category: "team", content_category_source: "generated" } }),
    ];
    expect(coveredCategories(assets).has("team")).toBe(false);
    expect(coveredCategories(assets, { includeGenerated: true }).has("team")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ISS-034 — a van fleet / a screenshot must never headline the page
// ---------------------------------------------------------------------------

describe("hero source eligibility (ISS-034)", () => {
  it("ranks equipment LAST for the hero — a parked van fleet is not a headline", () => {
    const policy = compositionPolicyFor("plumber");
    expect(policy.hero_priority[0]).toBe("work_result");
    expect(policy.hero_priority[1]).toBe("craft_detail");
    expect(policy.hero_priority[policy.hero_priority.length - 1]).toBe("equipment");
    // Every trade, including the overrides.
    for (const trade of ["doctor", "roofing", "handyman", "other"] as const) {
      const p = compositionPolicyFor(trade);
      expect(p.hero_priority[p.hero_priority.length - 1], trade).toBe("equipment");
    }
  });

  it("refuses equipment and credentials as hero edit sources", () => {
    expect(isHeroEditableCategory({ category: "equipment", confidence: 0.95, source: "vision" })).toBe(false);
    expect(isHeroEditableCategory({ category: "credentials", confidence: 0.95, source: "vision" })).toBe(false);
    expect(isHeroEditableCategory({ category: "work_result", confidence: 0.95, source: "vision" })).toBe(true);
  });

  it("THE BUG: a confidently vision-classified 'other' (a listing screenshot) is known-junk and never edited", () => {
    const screenshot = { category: "other", confidence: 0.99, source: "vision" } as const;
    expect(isKnownUnusableContent(screenshot)).toBe(true);
    expect(isHeroEditableCategory(screenshot)).toBe(false);
  });

  it("'unknown' is not 'known bad' — an unclassified photo stays editable (keeps ISS-008 alive)", () => {
    const unclassified = { category: "other", confidence: 0.2, source: "heuristic" } as const;
    expect(isKnownUnusableContent(unclassified)).toBe(false);
    expect(isHeroEditableCategory(unclassified)).toBe(true);
  });

  it("picks the best WORK photo as hero source even when nothing is scored (the defect's exact state)", () => {
    // Every asset unscored: the old score-based picker degenerated to insertion
    // order and returned the first row — the uploaded screenshot.
    const unscored = (id: string, category: ImageCategory) => asset(id, category, { score_json: null });
    const assets = [
      unscored("screenshot", "other"),
      unscored("van", "equipment"),
      unscored("bathroom", "work_result"),
    ];

    const ranked = rankRealPhotosForSlot(assets, compositionPolicyFor("plumber").hero_priority);
    const chosen = ranked.find((r) => isHeroEditableCategory(categoryOf(r.asset)));

    expect(ranked[0]!.asset.id).toBe("bathroom");
    expect(chosen!.asset.id).toBe("bathroom");
  });
});

// ---------------------------------------------------------------------------
// ISS-035 — one picture, one place on the page
// ---------------------------------------------------------------------------

import { fingerprintDistance, isNearDuplicate } from "../lib/images/fingerprint";

/** An enhanced derivative of `sourceId`, as `performImageEdit` records it. */
function enhancedOf(id: string, sourceId: string, category: ImageCategory, fingerprint?: string): AssetRecord {
  return asset(id, category, {
    kind: "generated_image",
    label: "enhanced",
    score_json: null,
    meta_json: {
      content_category: category,
      content_category_confidence: 0.9,
      content_category_source: "vision",
      source_asset_id: sourceId,
      ...(fingerprint ? { fingerprint } : {}),
    },
  });
}

describe("lineage dedup (ISS-035)", () => {
  it("reads an edited image's lineage from the source id the edit recorded", () => {
    expect(lineageRootOf(enhancedOf("e1", "orig1", "work_result"))).toBe("orig1");
    expect(lineageRootOf(asset("orig1", "work_result"))).toBe("orig1");
  });

  it("THE BUG: an original and its AI-enhanced twin never take two tiles — the better version wins", () => {
    const original = asset("orig1", "work_result");
    const enhanced = enhancedOf("enh1", "orig1", "work_result");

    const picked = selectGallery(buildCandidates([original, enhanced]), compositionPolicyFor("plumber"), 8);

    expect(picked).toHaveLength(1);
    expect(picked[0]!.asset_id).toBe("enh1"); // the improved version is the one shown
  });

  it("content already used by the hero never reappears in the gallery — including via an edited variant", () => {
    const original = asset("orig1", "work_result");
    const enhanced = enhancedOf("enh1", "orig1", "work_result");
    const other = asset("orig2", "craft_detail");

    const picked = selectGallery(buildCandidates([original, enhanced, other]), compositionPolicyFor("plumber"), 8, {
      exclude_lineages: new Set(["orig1"]), // the hero shows this content
    });

    expect(picked.map((d) => d.asset_id)).toEqual(["orig2"]);
  });

  it("collapseLineages keeps one best candidate per piece of content", () => {
    const collapsed = collapseLineages(
      buildCandidates([asset("orig1", "work_result"), enhancedOf("enh1", "orig1", "work_result"), asset("orig2", "team")]),
    );
    expect(collapsed.map((c) => c.asset.id).sort()).toEqual(["enh1", "orig2"]);
  });
});

describe("near-duplicate fingerprints (ISS-035)", () => {
  it("suppresses a second copy of the same picture even with no lineage between them", () => {
    const a = asset("a", "work_result", { meta_json: { content_category: "work_result", content_category_confidence: 0.9, content_category_source: "vision", fingerprint: "ffff0000ffff0000" } });
    // One bit different — the same photo, re-encoded.
    const b = asset("b", "work_result", { meta_json: { content_category: "work_result", content_category_confidence: 0.9, content_category_source: "vision", fingerprint: "ffff0000ffff0001" } });

    const picked = selectGallery(buildCandidates([a, b]), compositionPolicyFor("plumber"), 8);

    expect(picked).toHaveLength(1);
  });

  it("keeps genuinely different pictures", () => {
    const a = asset("a", "work_result", { meta_json: { content_category: "work_result", content_category_confidence: 0.9, content_category_source: "vision", fingerprint: "ffffffff00000000" } });
    const b = asset("b", "work_result", { meta_json: { content_category: "work_result", content_category_confidence: 0.9, content_category_source: "vision", fingerprint: "0f0f0f0f0f0f0f0f" } });

    const picked = selectGallery(buildCandidates([a, b]), compositionPolicyFor("plumber"), 8);

    expect(picked).toHaveLength(2);
  });

  it("never treats a missing or malformed fingerprint as a duplicate", () => {
    expect(fingerprintDistance(undefined, "ffff0000ffff0000")).toBeNull();
    expect(fingerprintDistance("short", "ffff0000ffff0000")).toBeNull();
    expect(isNearDuplicate(undefined, undefined)).toBe(false);

    const a = asset("a", "work_result");
    const b = asset("b", "work_result");
    expect(selectGallery(buildCandidates([a, b]), compositionPolicyFor("plumber"), 8)).toHaveLength(2);
  });

  it("measures distance symmetrically and exactly", () => {
    expect(fingerprintDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(fingerprintDistance("0000000000000000", "000000000000000f")).toBe(4);
    expect(fingerprintDistance("f0f0f0f0f0f0f0f0", "0f0f0f0f0f0f0f0f")).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// FEA-117 — the gallery is never nearly empty, and never repetitive
// ---------------------------------------------------------------------------

describe("gallery minimum + filler planning (FEA-117)", () => {
  it("every trade policy states a gallery minimum of at least 4", () => {
    for (const trade of ["plumber", "doctor", "roofing", "handyman", "other"] as const) {
      expect(compositionPolicyFor(trade).gallery_min, trade).toBeGreaterThanOrEqual(4);
    }
  });

  it("THE CASE: a business whose only photos are 120px thumbnails gets fillers up to the minimum", async () => {
    const db = await loadDb();
    const { planGalleryFillers, planImageGeneration } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });
    // Real photos exist but are unshowcaseable (the live-pilot situation:
    // every real photo was a 120px thumbnail).
    for (let i = 0; i < 8; i++) {
      db.insertAsset({
        audit_id: audit.id,
        kind: "harvested_image",
        status: "normalized",
        meta_json: { width: 120, height: 120, content_category: "work_result", content_category_confidence: 0.9, content_category_source: "vision" },
      });
    }

    const channelPlans = planImageGeneration(audit.id, "plumber", ["hero_image", "team_image", "work_proof_images"]);
    const fillers = planGalleryFillers({
      auditId: audit.id,
      trade: "plumber",
      services: ["Badsanierung", "Heizungsinstallation", "Rohrreinigung"],
      channelPlans,
    });

    // hero + about consume their own images, so one channel image reaches the
    // gallery — three more are needed to reach four.
    expect(fillers.length).toBe(3);
    expect(fillers.every((f) => f.slot_key?.startsWith("gallery_filler_"))).toBe(true);
    expect(fillers.every((f) => f.category !== "credentials")).toBe(true);
    // Each filler is a DIFFERENT picture: distinct category or distinct subject.
    const identities = fillers.map((f) => `${f.category}:${f.subject ?? ""}`);
    expect(new Set(identities).size).toBe(fillers.length);
  });

  it("plans nothing when the business already has enough showcaseable photos", async () => {
    const db = await loadDb();
    const { planGalleryFillers, planImageGeneration } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });
    for (const category of ["work_result", "craft_detail", "storefront", "team", "equipment"] as const) {
      db.insertAsset({
        audit_id: audit.id,
        kind: "harvested_image",
        status: "normalized",
        // ISS-020 also requires the photo to READ as real work, from the
        // Visual Director's own evidence text — so this fixture carries it.
        score_json: ["I1", "I2", "I3", "I4", "I5", "I6"].map((c) => ({
          id: c,
          score: 4,
          evidence: "real photo of a finished bathroom installation on a job site",
          source: "vision",
        })),
        meta_json: {
          width: 1200,
          height: 900,
          content_category: category,
          content_category_confidence: 0.9,
          content_category_source: "vision",
          content_category_subject: `finished ${category} shot`,
        },
      });
    }

    const channelPlans = planImageGeneration(audit.id, "plumber", ["hero_image", "team_image", "work_proof_images"]);
    const fillers = planGalleryFillers({ auditId: audit.id, trade: "plumber", services: ["Bad"], channelPlans });

    expect(fillers).toHaveLength(0);
  });

  it("is bounded — a business with no named services cannot spin up unlimited generations", async () => {
    const db = await loadDb();
    const { planGalleryFillers, MAX_GALLERY_FILLERS } = await import("../lib/improve/image");
    const audit = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" });

    const fillers = planGalleryFillers({ auditId: audit.id, trade: "plumber", services: [], channelPlans: [] });

    expect(fillers.length).toBeLessThanOrEqual(MAX_GALLERY_FILLERS);
  });

  it("a category may repeat in the gallery only with a DIFFERENT subject", () => {
    const withSubject = (id: string, subject: string) =>
      asset(id, "work_result", {
        meta_json: {
          content_category: "work_result",
          content_category_confidence: 0.9,
          content_category_source: "vision",
          content_category_subject: subject,
        },
      });
    const sameScene = [withSubject("a", "finished tiled bathroom"), withSubject("b", "Finished tiled bathroom!")];
    const differentScenes = [withSubject("c", "finished tiled bathroom"), withSubject("d", "new gas boiler")];

    expect(selectGallery(buildCandidates(sameScene), compositionPolicyFor("plumber"), 8)).toHaveLength(1);
    expect(selectGallery(buildCandidates(differentScenes), compositionPolicyFor("plumber"), 8)).toHaveLength(2);
  });
});
