// ISS-017 regression guard: the After composition is new-by-default — an
// original photo is admitted only if it clears the ISS-014 logo gate AND is a
// high-value real photo or a credential asset; weak/small/unscored originals
// are excluded, each with a recorded reason. Pure classifier tests need no DB;
// the gallery-filter, meta-persist, and preview integration use the repo's
// temp-dir storage convention (APP_DB_PATH / APP_STORAGE_DIR).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssetRecord } from "../lib/db";
import {
  applyOneSourceOneTreatment,
  classifyContent,
  curateAfterOriginal,
  filterGalleryByCuration,
  isTextHeavySource,
  recordAfterCuration,
} from "../lib/improve/curate";

// ---------------------------------------------------------------------------
// Pure classifier — no DB
// ---------------------------------------------------------------------------

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "a1",
    audit_id: "aud",
    kind: "harvested_image",
    source: null,
    storage_path: "images/aud/a1.jpg",
    meta_json: null,
    score_json: null,
    label: null,
    status: "normalized",
    ...overrides,
  };
}

/** Six I1-I6 criteria all at `per`, summing to `per * 6` out of 30. */
function scores(per: number): AssetRecord["score_json"] {
  return ["I1", "I2", "I3", "I4", "I5", "I6"].map((id) => ({ id, score: per, evidence: "e", source: "vision" }));
}

describe("curateAfterOriginal (ISS-017)", () => {
  it("keeps a high-value, large, well-scored real photo with a real_photo reason", () => {
    const c = curateAfterOriginal(
      asset({ meta_json: { width: 1200, height: 900, src: "https://x.test/work.jpg", alt: "finished bathroom" }, score_json: scores(3) }),
    );
    expect(c.include).toBe(true);
    expect(c.group).toBe("real_photo");
    expect(c.reason).toMatch(/high-value real photo/i);
    expect(c.reason).toContain("18/30");
  });

  it("keeps a credential asset even when small/unscored, grouped as credential", () => {
    const c = curateAfterOriginal(
      asset({ meta_json: { width: 600, height: 800, alt: "Meister-Urkunde der Handwerkskammer" }, score_json: null }),
    );
    expect(c.include).toBe(true);
    expect(c.group).toBe("credential");
    expect(c.reason).toMatch(/credential|certificate|award/i);
  });

  it("excludes a low-scored real photo (new-by-default)", () => {
    const c = curateAfterOriginal(asset({ meta_json: { width: 1200, height: 900 }, score_json: scores(1) }));
    expect(c.include).toBe(false);
    expect(c.reason).toMatch(/low image score 6\/30/i);
    expect(c.reason).toMatch(/replaced by a new AI concept/i);
  });

  it("excludes an unscored original (cannot be proven high-value)", () => {
    const c = curateAfterOriginal(asset({ meta_json: { width: 900, height: 700 }, score_json: null }));
    expect(c.include).toBe(false);
    expect(c.reason).toMatch(/not vision-scored/i);
  });

  it("excludes a thumbnail even with a perfect score (too small to showcase)", () => {
    const c = curateAfterOriginal(asset({ meta_json: { width: 120, height: 120 }, score_json: scores(5) }));
    expect(c.include).toBe(false);
    expect(c.reason).toMatch(/too small for showcase/i);
  });

  it("excludes a logo/favicon-scale asset via the ISS-014 gate", () => {
    const c = curateAfterOriginal(asset({ meta_json: { width: 50, height: 50 }, score_json: scores(5) }));
    expect(c.include).toBe(false);
    expect(c.reason).toMatch(/ISS-014/);
  });

  it("excludes a wordmark/banner strip via the ISS-014 gate", () => {
    const c = curateAfterOriginal(asset({ meta_json: { width: 800, height: 120 }, score_json: scores(5) }));
    expect(c.include).toBe(false);
    expect(c.reason).toMatch(/ISS-014/);
  });
});

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-curate-test-"));
  process.env.APP_DB_PATH = join(tmpDir, "app.db");
  process.env.APP_STORAGE_DIR = join(tmpDir, "storage");
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
});

afterEach(async () => {
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
  delete process.env.APP_DB_PATH;
  delete process.env.APP_STORAGE_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("filterGalleryByCuration + recordAfterCuration (ISS-017)", () => {
  it("drops weak originals from a baked gallery but keeps generated concepts and high-value originals", async () => {
    const db = await import("../lib/db");
    const auditId = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "REPLAY" }).id;

    const weak = db.insertAsset({ audit_id: auditId, kind: "harvested_image", meta_json: { width: 300, height: 264 }, status: "normalized" });
    const good = db.insertAsset({
      audit_id: auditId,
      kind: "harvested_image",
      meta_json: { width: 1200, height: 800, alt: "finished job" },
      score_json: scores(4),
      status: "normalized",
    });
    const concept = db.insertAsset({ audit_id: auditId, kind: "generated_image", label: "ai_concept", status: "generated" });

    const baked = [
      { asset_ref: concept.id, label: "ai_concept" as const },
      { asset_ref: weak.id, label: null },
      { asset_ref: good.id, label: null },
    ];

    const filtered = filterGalleryByCuration(auditId, baked);
    const refs = filtered.map((g) => g.asset_ref);
    expect(refs).toContain(concept.id); // generated always kept
    expect(refs).toContain(good.id); // high-value original kept
    expect(refs).not.toContain(weak.id); // weak original dropped
  });

  it("resolves baked replay refs via replay_fixture_asset_id and drops weak fixture originals", async () => {
    const db = await import("../lib/db");
    const auditId = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "REPLAY" }).id;

    // Replay seeds fresh ids that carry the fixture id in meta (as runReplayPipeline does).
    db.insertAsset({
      audit_id: auditId,
      kind: "harvested_image",
      meta_json: { width: 300, height: 264, replay_fixture_asset_id: "fixture-weak" },
      status: "normalized",
    });

    const baked = [
      { asset_ref: "fixture-concept", label: "ai_concept" as const }, // generated, no row — kept
      { asset_ref: "fixture-weak", label: null }, // resolves to the weak original — dropped
    ];

    const refs = filterGalleryByCuration(auditId, baked).map((g) => g.asset_ref);
    expect(refs).toContain("fixture-concept");
    expect(refs).not.toContain("fixture-weak");
  });

  it("records each original's After-selection reason onto meta_json.after_curation", async () => {
    const db = await import("../lib/db");
    const auditId = db.createAudit({ business_json: { brand_name: "X", trade: "plumber", presence: {} }, execution_mode: "LIVE" }).id;

    const good = db.insertAsset({
      audit_id: auditId,
      kind: "harvested_image",
      meta_json: { width: 1200, height: 800, alt: "finished bathroom job on site" },
      score_json: scores(4),
      status: "normalized",
    });
    const weak = db.insertAsset({ audit_id: auditId, kind: "harvested_image", meta_json: { width: 300, height: 264 }, status: "normalized" });

    recordAfterCuration(auditId);

    const rows = new Map(db.listAssets(auditId).map((a) => [a.id, a.meta_json as { after_curation?: { include: boolean; group: string | null; reason: string } }]));
    expect(rows.get(good.id)?.after_curation?.include).toBe(true);
    expect(rows.get(good.id)?.after_curation?.group).toBe("real_photo");
    expect(rows.get(good.id)?.after_curation?.reason).toBeTruthy();
    expect(rows.get(weak.id)?.after_curation?.include).toBe(false);
    expect(rows.get(weak.id)?.after_curation?.reason).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ISS-019 — text-heavy exclusion + one-source-one-treatment (pure, no DB)
// ---------------------------------------------------------------------------

describe("isTextHeavySource (ISS-019)", () => {
  it("flags flyers/price-lists/slider graphics/screenshots from vision, alt, or src", () => {
    expect(isTextHeavySource(asset({ meta_json: { src: "https://x.test/themes/slide/auto-start.png" } }))).toBe(true);
    expect(
      isTextHeavySource(
        asset({ score_json: [{ id: "I5", score: 1, evidence: "Flyer with a heavy text overlay and a price list", source: "vision" }] }),
      ),
    ).toBe(true);
    expect(isTextHeavySource(asset({ meta_json: { alt: "Preisliste Rohrreinigung" } }))).toBe(true);
    expect(isTextHeavySource(asset({ meta_json: { src: "screenshot-services.png" } }))).toBe(true);
  });

  it("passes a clean real work photo", () => {
    const photo = asset({
      meta_json: { src: "gasthermenwartung.jpg", alt: "technician servicing a boiler" },
      score_json: [{ id: "I2", score: 5, evidence: "Real photo of a plumber working on a job site", source: "vision" }],
    });
    expect(isTextHeavySource(photo)).toBe(false);
  });
});

describe("applyOneSourceOneTreatment (ISS-019)", () => {
  const concept = asset({ id: "c1", kind: "generated_image", label: "ai_concept" });

  it("drops a garbled enhanced whose edit source is text-heavy", () => {
    const src = asset({ id: "src1", meta_json: { src: "auto-start.png", width: 428, height: 264 } });
    const enh = asset({ id: "enh1", kind: "generated_image", label: "enhanced", meta_json: { source_asset_id: "src1" } });
    const byRef = new Map<string, AssetRecord>([["src1", src], ["enh1", enh], ["c1", concept]]);
    const gallery = [
      { asset_ref: "enh1", label: "enhanced" as const },
      { asset_ref: "c1", label: "ai_concept" as const },
    ];
    const refs = applyOneSourceOneTreatment(gallery, byRef).map((g) => g.asset_ref);
    expect(refs).not.toContain("enh1"); // garbled enhanced removed
    expect(refs).toContain("c1");
  });

  it("never shows a source both enhanced and raw (dedupe)", () => {
    const src = asset({
      id: "src1",
      meta_json: { src: "real-work.jpg", width: 1200, height: 800 },
      score_json: [{ id: "I2", score: 5, evidence: "real job photo", source: "vision" }],
    });
    const enh = asset({ id: "enh1", kind: "generated_image", label: "enhanced", meta_json: { source_asset_id: "src1" } });
    const byRef = new Map<string, AssetRecord>([["src1", src], ["enh1", enh]]);
    const gallery = [
      { asset_ref: "enh1", label: "enhanced" as const },
      { asset_ref: "src1", label: null },
    ];
    const refs = applyOneSourceOneTreatment(gallery, byRef).map((g) => g.asset_ref);
    expect(refs).toContain("enh1"); // the enhanced treatment is kept
    expect(refs).not.toContain("src1"); // the same source is not also shown raw
  });

  it("dedupes the raw source resolved via replay_fixture_asset_id", () => {
    const src = asset({
      id: "freshid",
      meta_json: { src: "real-work.jpg", width: 1200, height: 800, replay_fixture_asset_id: "fix-src" },
      score_json: [{ id: "I2", score: 5, evidence: "real job photo", source: "vision" }],
    });
    const enh = asset({ id: "freshenh", kind: "generated_image", label: "enhanced", meta_json: { source_asset_id: "fix-src" } });
    const byRef = new Map<string, AssetRecord>([["fix-src", src], ["freshid", src], ["fix-enh", enh], ["freshenh", enh]]);
    const gallery = [
      { asset_ref: "fix-enh", label: "enhanced" as const },
      { asset_ref: "fix-src", label: null },
    ];
    const refs = applyOneSourceOneTreatment(gallery, byRef).map((g) => g.asset_ref);
    expect(refs).toContain("fix-enh");
    expect(refs).not.toContain("fix-src");
  });
});

// ---------------------------------------------------------------------------
// ISS-020 — content-based credential/real-work eligibility (pure, no DB)
// ---------------------------------------------------------------------------

describe("classifyContent (ISS-020)", () => {
  it("classifies genuine work / team / premises / vehicle imagery as work", () => {
    expect(classifyContent(asset({ score_json: [{ id: "I2", score: 5, evidence: "Real on-site photo of a technician servicing a gas boiler", source: "vision" }] }))).toBe("work");
    expect(classifyContent(asset({ meta_json: { alt: "our team in front of the service van" } }))).toBe("work");
    expect(classifyContent(asset({ meta_json: { alt: "finished bathroom renovation" } }))).toBe("work");
  });

  it("classifies novelty / stock / marketing / screenshot content as non_work", () => {
    expect(classifyContent(asset({ score_json: [{ id: "I2", score: 1, evidence: "Novelty stock image of a dog peering into a drain pipe", source: "vision" }] }))).toBe("non_work");
    expect(classifyContent(asset({ score_json: [{ id: "I2", score: 1, evidence: "Screenshot of a tablet showing the services menu — a marketing graphic", source: "vision" }] }))).toBe("non_work");
    expect(classifyContent(asset({ score_json: [{ id: "I2", score: 1, evidence: "Slider with a price-list text overlay", source: "vision" }] }))).toBe("non_work");
  });

  it("does not false-positive on a genuine photo whose I5 evidence says 'no text overlay'", () => {
    expect(classifyContent(asset({ score_json: [{ id: "I2", score: 5, evidence: "Real job photo of a plumber on site" }, { id: "I5", score: 4, evidence: "Clean frame, no text overlay" }] as never }))).toBe("work");
  });

  it("classifies a credential asset as credential, ahead of anything else", () => {
    expect(classifyContent(asset({ meta_json: { alt: "Meister-Urkunde der Handwerkskammer" } }))).toBe("credential");
  });
});

describe("curateAfterOriginal content gate (ISS-020)", () => {
  it("EXCLUDES a novelty/marketing image even when it scores and sizes well", () => {
    const dog = curateAfterOriginal(
      asset({
        meta_json: { width: 800, height: 600 },
        score_json: [
          { id: "I1", score: 4, evidence: "sharp" },
          { id: "I2", score: 4, evidence: "Novelty stock image of a dog in a pipe" },
          { id: "I3", score: 4, evidence: "x" },
          { id: "I4", score: 4, evidence: "x" },
          { id: "I5", score: 3, evidence: "x" },
          { id: "I6", score: 3, evidence: "x" },
        ] as never,
      }),
    );
    expect(dog.include).toBe(false);
    expect(dog.reason).toMatch(/novelty\/stock\/marketing\/screenshot/i);
  });

  it("KEEPS a genuine, high-value work photo as a real_photo", () => {
    const work = curateAfterOriginal(
      asset({
        meta_json: { width: 800, height: 533, alt: "technician servicing a gas boiler on site" },
        score_json: [
          { id: "I1", score: 4, evidence: "sharp" },
          { id: "I2", score: 5, evidence: "Real on-site job photo" },
          { id: "I3", score: 5, evidence: "job proof" },
          { id: "I4", score: 4, evidence: "clean" },
          { id: "I5", score: 4, evidence: "no text overlay" },
          { id: "I6", score: 2, evidence: "branding" },
        ] as never,
      }),
    );
    expect(work.include).toBe(true);
    expect(work.group).toBe("real_photo");
  });

  it("EXCLUDES a high-value image whose content cannot be identified as genuine work", () => {
    const unknown = curateAfterOriginal(asset({ meta_json: { width: 900, height: 700 }, score_json: scores(4) }));
    expect(unknown.include).toBe(false);
    expect(unknown.reason).toMatch(/content not identifiable as genuine work/i);
  });
});
