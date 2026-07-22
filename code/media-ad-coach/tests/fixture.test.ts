/**
 * F-082 — contract tests for the full offline REPLAY fixture. These check
 * that the fixture is not just schema-shaped (tests/schemas.test.ts already
 * covers FixtureAudit/Report/Asset generically) but *complete*: every
 * improvable channel carries a recorded `after` that round-trips through the
 * exact per-channel schema docs/CONTRACTS.md documents, every generated
 * image is truthfully labeled, and every /fixtures/... path the fixture
 * references actually exists on disk under public/ — so REPLAY mode never
 * serves a broken <img>.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FixtureAudit, PreviewJson, Report, RewriteOutput, type Asset } from "../lib/schemas";
import { overallScore } from "../lib/rubric";
import fixture from "../lib/fixtures/replay-audit.json";

const PUBLIC_DIR = join(process.cwd(), "public");

const TEXT_CHANNEL_IDS = [
  "hero_headline",
  "business_description",
  "services_copy",
  "cta_contact",
  "legal_footer",
  "platform_consistency",
] as const;

const CONCEPT_IMAGE_CHANNEL_IDS = ["hero_image", "work_proof_images", "team_image"] as const;

function publicPathFor(fixturePath: string): string {
  // Fixture storage_path values are public URL paths ("/fixtures/...");
  // resolve them against the actual public/ directory on disk.
  return join(PUBLIC_DIR, fixturePath.replace(/^\//, ""));
}

describe("REPLAY fixture — report parses and stays schema-valid", () => {
  it("parses end to end as a Report", () => {
    const result = Report.parse(fixture.report);
    expect(result.execution_mode).toBe("REPLAY");
  });

  it("keeps the frozen scoring totals untouched (rubric.ts's numbers, not this fixture's)", () => {
    const expected = overallScore(fixture.report.text.score, fixture.report.images.score);
    expect(fixture.report.overall_score).toBe(expected.overall_score);
    expect(fixture.report.band).toBe(expected.band);
  });

  it("truthfully states that REPLAY was recorded from a completed LIVE audit", () => {
    expect(fixture.report.disclaimers.some((d) => /recorded from completed LIVE audit/i.test(d))).toBe(true);
    expect(fixture.report.disclaimers.some((d) => /replay makes no live partner calls/i.test(d))).toBe(true);
  });

  it("does not fake a Cognee memory hit in the recorded sample", () => {
    expect(fixture.report.memory_note).toBeNull();
  });
});

describe("REPLAY fixture — every improvable channel has a recorded after", () => {
  const channelById = new Map(fixture.report.channels.map((c) => [c.id, c]));
  const recordedTextChannelIds = TEXT_CHANNEL_IDS.filter((id) => channelById.get(id)?.after !== null && channelById.has(id));
  const recordedConceptImageIds = CONCEPT_IMAGE_CHANNEL_IDS.filter(
    (id) => channelById.get(id)?.after !== null && channelById.has(id)
  );

  it("records every improvable channel present in the real audit, leaving pinned rows null", () => {
    const improvable = fixture.report.channels.filter((c) => c.id !== "optimized_site" && c.id !== "promo_video");
    expect(improvable.length).toBeGreaterThan(0);
    expect(improvable.every((c) => c.after !== null)).toBe(true);
    expect(channelById.get("optimized_site")?.after).toBeNull();
    expect(channelById.get("promo_video")?.after).toBeNull();
  });

  it.each(recordedTextChannelIds)("text channel '%s' after parses as a valid RewriteOutput for that exact channel", (id) => {
    const channel = channelById.get(id);
    expect(channel).toBeDefined();
    const result = RewriteOutput.safeParse(channel!.after);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel_id).toBe(id);
    }
  });

  it.each(recordedConceptImageIds)("image channel '%s' after matches the {shot_brief, best_existing_asset_id, generated_asset_id, generation_error} shape", (id) => {
    const channel = channelById.get(id);
    const after = channel?.after as {
      shot_brief?: unknown;
      best_existing_asset_id?: unknown;
      generated_asset_id?: unknown;
      generation_error?: unknown;
    } | null;
    expect(typeof after?.shot_brief).toBe("string");
    expect((after?.shot_brief as string).length).toBeGreaterThan(0);
    expect(typeof after?.generated_asset_id === "string" || after?.generated_asset_id === null).toBe(true);
    expect(typeof after?.best_existing_asset_id === "string" || after?.best_existing_asset_id === null).toBe(true);
    expect(after?.generation_error).toBeNull();
  });

  it("every image channel's generated_asset_id points at a real generated_image asset labeled ai_concept", () => {
    const assetsById = new Map((fixture.assets as Asset[]).map((a) => [a.id, a]));
    for (const id of recordedConceptImageIds) {
      const after = channelById.get(id)?.after as { generated_asset_id?: string | null } | null;
      const genId = after?.generated_asset_id;
      expect(genId).toBeTruthy();
      const asset = assetsById.get(genId as string);
      expect(asset?.kind).toBe("generated_image");
      expect(asset?.label).toBe("ai_concept");
    }
  });

  it("channels stay status 'todo' in the fixture (the REPLAY improve flow flips them at demo time)", () => {
    for (const channel of fixture.report.channels) {
      if (channel.after !== null) expect(channel.status).toBe("todo");
    }
  });
});

describe("REPLAY fixture — assets", () => {
  it("truth-labels concepts and enhancements while leaving harvested evidence unlabeled", () => {
    for (const asset of fixture.assets as Asset[]) {
      if (asset.kind === "generated_image") {
        expect(["ai_concept", "enhanced"]).toContain(asset.label);
        expect(asset.status).toBe("generated");
      } else {
        expect(asset.label).toBeNull();
      }
    }
  });

  it("contains real before photos, AI concepts, and a provider-produced enhancement", () => {
    const harvested = (fixture.assets as Asset[]).filter((a) => a.kind === "harvested_image");
    const concepts = (fixture.assets as Asset[]).filter((a) => a.label === "ai_concept");
    const enhanced = (fixture.assets as Asset[]).filter((a) => a.label === "enhanced");
    expect(harvested.length).toBeGreaterThan(0);
    expect(concepts.length).toBeGreaterThan(0);
    expect(enhanced.length).toBeGreaterThan(0);
  });
});

describe("REPLAY fixture — preview_json", () => {
  it("parses as a fully valid PreviewJson", () => {
    const result = PreviewJson.safeParse(fixture.preview_json);
    expect(result.success).toBe(true);
  });

  it("has exactly 3 service cards and a non-empty what_changed list", () => {
    expect(fixture.preview_json?.services).toHaveLength(3);
    expect((fixture.preview_json?.what_changed.length ?? 0)).toBeGreaterThan(0);
  });

  it("gallery references only real (before) or ai_concept-labeled (after) assets, matching each asset's own label", () => {
    const assetsById = new Map((fixture.assets as Asset[]).map((a) => [a.id, a]));
    for (const entry of fixture.preview_json?.gallery ?? []) {
      const asset = assetsById.get(entry.asset_ref);
      expect(asset).toBeDefined();
      expect(entry.label).toBe(asset?.label ?? null);
    }
  });

  it("before panel reflects the original (unimproved) site text and photos", () => {
    expect(fixture.preview_json?.before.sections.length).toBeGreaterThan(0);
    const harvestedIds = (fixture.assets as Asset[])
      .filter((asset) => asset.kind === "harvested_image")
      .map((asset) => asset.id);
    expect(fixture.preview_json?.before.original_image_refs).toEqual(harvestedIds);
  });
});

describe("REPLAY fixture — every referenced /fixtures/ path exists on disk", () => {
  it("every asset's storage_path resolves to a real file under public/", () => {
    for (const asset of fixture.assets as Asset[]) {
      expect(asset.storage_path).toBeTruthy();
      const resolved = publicPathFor(asset.storage_path as string);
      expect(existsSync(resolved), `missing file for asset ${asset.id}: ${resolved}`).toBe(true);
    }
  });
});

describe("REPLAY fixture — full offline walkthrough", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "visibel-full-replay-test-"));
    process.env.APP_DB_PATH = join(tmpDir, "app.db");
    process.env.APP_STORAGE_DIR = join(tmpDir, "storage");
    process.env.REPLAY_STEP_DELAY_MS = "0";
    const db = await import("../lib/db");
    db.closeDb();
  });

  afterEach(async () => {
    const db = await import("../lib/db");
    db.closeDb();
    delete process.env.APP_DB_PATH;
    delete process.env.APP_STORAGE_DIR;
    delete process.env.REPLAY_STEP_DELAY_MS;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runs analyze → improve all → preview with no live credentials", async () => {
    const db = await import("../lib/db");
    const { runAnalyzePipeline } = await import("../lib/pipeline/orchestrator");
    const { runImprove } = await import("../lib/improve/orchestrate");
    const audit = db.createAudit({ business_json: fixture.business, execution_mode: "REPLAY" });

    await runAnalyzePipeline(audit.id);
    await runImprove(audit.id, "all", { replayStepDelayMs: 0 });

    const completed = db.getAudit(audit.id);
    expect(completed?.status).toBe("complete");
    // ISS-017 + ISS-019 + ISS-020 combined: the After gallery is new-by-default,
    // content-gated, AND one-source-one-treatment. Curation keeps the AI concepts
    // and the two GENUINE work originals, but drops (ISS-020) the novelty/
    // screenshot graphics — the dog stock shot `verstopfung.png` and the tablet
    // screenshot — and (ISS-019) the baked ENHANCED image, whose edit source
    // (`auto-start.png` slider) is a text-heavy graphic image models garble.
    // Net: 3 AI concepts + 2 genuine work photos. Everything else is unchanged.
    const assetById = new Map((fixture.assets as Asset[]).map((a) => [a.id, a]));
    const NON_WORK = new Set([
      "b84efbf5-9b08-4b58-926f-43feea8849d4", // dog novelty stock (ISS-020)
      "fab437da-1d99-49a1-b934-e96aa9bda662", // tablet screenshot (ISS-020)
    ]);
    const DROPPED_ENHANCED = "f181b7a2-687d-4bad-a487-3569dbffef61"; // text-heavy edit source (ISS-019)
    const curatedGallery = (fixture.preview_json?.gallery ?? []).filter(
      (g: { asset_ref: string }) => !NON_WORK.has(g.asset_ref) && g.asset_ref !== DROPPED_ENHANCED,
    );
    expect(completed?.preview_json).toEqual({ ...fixture.preview_json, gallery: curatedGallery });
    const finalGallery = (completed?.preview_json as { gallery: { asset_ref: string; label: string | null }[] }).gallery;
    expect(finalGallery).toHaveLength(5);
    // ISS-019: no garbled enhanced survives into the After gallery.
    expect(finalGallery.every((g) => g.label !== "enhanced")).toBe(true);
    // ISS-020: the credentials block (label-null originals) shows only GENUINE work photos.
    const credentialRefs = finalGallery.filter((g) => g.label === null).map((g) => g.asset_ref);
    expect(credentialRefs.length).toBeGreaterThan(0);
    for (const ref of credentialRefs) {
      expect(assetById.get(ref)?.kind).toBe("harvested_image");
      expect(NON_WORK.has(ref)).toBe(false); // no novelty/screenshot in credentials
    }

    const channels = new Map(db.listChannels(audit.id).map((channel) => [channel.id, channel]));
    for (const fixtureChannel of fixture.report.channels) {
      if (fixtureChannel.after !== null || fixtureChannel.id === "optimized_site") {
        expect(channels.get(fixtureChannel.id)?.status).toBe("improved");
      }
    }
    expect(channels.get("promo_video")?.status).toBe("coming_soon");
  });
});

// ---------------------------------------------------------------------------
// scripts/record-fixture.ts — exercise repeatable re-recording against an
// isolated DB seeded from the committed real-run fixture.
// ---------------------------------------------------------------------------

describe("scripts/record-fixture.ts — re-record integration", () => {
  let tmpDir: string;
  let storageDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "visibel-record-fixture-test-"));
    storageDir = join(tmpDir, "storage");
    process.env.APP_DB_PATH = join(tmpDir, "app.db");
    process.env.APP_STORAGE_DIR = storageDir;
  });

  afterEach(async () => {
    const dbModule = await import("../lib/db");
    dbModule.closeDb();
    delete process.env.APP_DB_PATH;
    delete process.env.APP_STORAGE_DIR;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reproduces a FixtureAudit-valid fixture from a DB seeded with this fixture's own recorded content", async () => {
    const db = await import("../lib/db");
    db.closeDb();

    const audit = db.createAudit({ business_json: fixture.business, execution_mode: "LIVE" });

    // Seed real image files at the storage paths a LIVE run would have left
    // behind (lib/pipeline/images.ts / lib/improve/image.ts conventions).
    const imagesDir = join(storageDir, "images", audit.id);
    const generatedDir = join(storageDir, "generated", audit.id);
    mkdirSync(imagesDir, { recursive: true });
    mkdirSync(generatedDir, { recursive: true });

    const copyableAssets = (fixture.assets as Asset[]).filter((asset) =>
      ["harvested_image", "uploaded_image", "generated_image"].includes(asset.kind)
    );
    for (const [index, asset] of copyableAssets.entries()) {
      const targetDir = asset.kind === "generated_image" ? generatedDir : imagesDir;
      const targetPath = join(targetDir, `asset-${index}${asset.kind === "generated_image" ? ".png" : ".jpg"}`);
      copyFileSync(publicPathFor(asset.storage_path as string), targetPath);
      db.insertAsset({
        audit_id: audit.id,
        kind: asset.kind,
        source: asset.source,
        storage_path: targetPath,
        meta_json: asset.meta,
        score_json: asset.score,
        label: asset.label,
        status: asset.status,
      });
    }

    // The `channels` table is what a real "Do It For You" run writes
    // `after_json` to — seed it from this fixture's already-recorded afters.
    db.replaceChannels(
      audit.id,
      fixture.report.channels.map((channel) => ({
        id: channel.id,
        lane: channel.lane,
        title: channel.title,
        one_liner: channel.one_liner,
        priority: channel.priority,
        severity: channel.severity,
        status: channel.after !== null ? "improved" : channel.status,
        findings_json: channel.finding_ids,
        before_json: channel.before,
        after_json: channel.after,
      }))
    );

    db.updateAudit(audit.id, {
      status: "complete",
      report_json: fixture.report,
      overall_score: fixture.report.overall_score,
      preview_json: fixture.preview_json,
    });

    const outPath = join(tmpDir, "recorded-fixture.json");
    const recordPublicDir = join(tmpDir, "public");
    const { recordFixture } = await import("../scripts/record-fixture");
    const result = await recordFixture(audit.id, { outPath, publicDir: recordPublicDir, slug: "test-record" });

    // report_json's status ("todo") wins over the live "improved" rows —
    // the recorded fixture must still demo todo -> improved on REPLAY, not
    // load already-done.
    expect(result.channelsWithAfter).toBe(fixture.report.channels.filter((channel) => channel.after !== null).length);
    expect(result.assetsCopied).toBe(copyableAssets.length);
    expect(existsSync(outPath)).toBe(true);

    const written = JSON.parse(readFileSync(outPath, "utf-8"));
    const parsed = FixtureAudit.safeParse(written);
    expect(parsed.success).toBe(true);
    expect(written.assets).toHaveLength(copyableAssets.length);
    expect(new Set(written.assets.map((asset: Asset) => asset.storage_path)).size).toBe(copyableAssets.length);

    for (const channel of written.report.channels) {
      if (channel.after !== null) expect(channel.status).toBe("todo");
    }

    for (const asset of written.assets) {
      const resolved = join(recordPublicDir, (asset.storage_path as string).replace(/^\//, ""));
      expect(existsSync(resolved), `record-fixture did not copy ${asset.id} to ${resolved}`).toBe(true);
    }
  });

  it("throws a clear, actionable error for an unknown audit id", async () => {
    const { recordFixture } = await import("../scripts/record-fixture");
    await expect(recordFixture("does-not-exist")).rejects.toThrow(/No audit found with id "does-not-exist"/);
  });

  it("throws a clear error when the audit hasn't finished analyzing yet", async () => {
    const db = await import("../lib/db");
    db.closeDb();
    const audit = db.createAudit({ business_json: fixture.business, execution_mode: "LIVE" }); // status defaults to "draft"

    const { recordFixture } = await import("../scripts/record-fixture");
    await expect(recordFixture(audit.id)).rejects.toThrow(/status "draft"/);
  });

  it("refuses to re-record from a REPLAY audit", async () => {
    const db = await import("../lib/db");
    db.closeDb();
    const audit = db.createAudit({ business_json: fixture.business, execution_mode: "REPLAY" });
    db.updateAudit(audit.id, { status: "complete", report_json: fixture.report });

    const { recordFixture } = await import("../scripts/record-fixture");
    await expect(recordFixture(audit.id)).rejects.toThrow(/only accepts a real LIVE audit/);
  });
});
