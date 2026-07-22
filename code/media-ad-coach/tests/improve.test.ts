import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAI } from "openai";

import { PreviewJson, RewriteOutput } from "../lib/schemas";
import { improveTextChannel, improveTextChannels, type ImproveTextChannelInput } from "../lib/improve/text";
import {
  CONCEPT_IMAGE_CAP,
  GENERATED_IMAGE_CAP,
  buildImageFixesAfter,
  countGeneratedImages,
  enhanceBestExistingImage,
  generateChannelImage,
  pickBestExistingAsset,
} from "../lib/improve/image";
import { assemblePreview, normalizeGenerationErrorReason } from "../lib/improve/preview";
import { runImprove } from "../lib/improve/orchestrate";
import { POST as improve_POST } from "../app/api/audits/[id]/improve/route";
import { runImproveAndLogCrash } from "../lib/server/runners";
import replayFixture from "../lib/fixtures/replay-audit.json";

let tmpDir: string;
let storageDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-improve-test-"));
  storageDir = join(tmpDir, "storage");
  process.env.APP_DB_PATH = join(tmpDir, "app.db");
  process.env.APP_STORAGE_DIR = storageDir;
  // Same pattern as tests/api.test.ts/tests/db.test.ts: the lazy singleton in
  // lib/db.ts only re-reads APP_DB_PATH after closeDb() clears it.
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

async function loadDb() {
  return await import("../lib/db");
}

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function seedBusiness(overrides: Record<string, unknown> = {}) {
  return {
    brand_name: "Sanitär Krause Berlin",
    trade: "plumber",
    city: "Berlin",
    background: "Bad- und Heizungsinstallation seit 1998",
    presence: { website: "https://example.test" },
    ...overrides,
  };
}

interface ChannelRowSeed {
  id: string;
  lane: string;
  title: string;
  one_liner: string;
  priority: number;
  severity: string;
  status: string;
  findings_json: unknown;
  before_json: unknown;
  after_json: unknown;
}

/** A full, realistic 12-row channel set matching the CHANNEL_CATALOG (plan
 *  §2.5), all "todo" (promo_video "coming_soon") unless overridden by id. */
function baseChannelRows(overrides: Record<string, Partial<ChannelRowSeed>> = {}): ChannelRowSeed[] {
  const rows: ChannelRowSeed[] = [
    {
      id: "hero_headline",
      lane: "text",
      title: "Headline & first impression",
      one_liner: "No trade, no promise in the hero.",
      priority: 12,
      severity: "high",
      status: "todo",
      findings_json: ["f-t1"],
      before_json: { excerpts: ["Sanitär Krause"] },
      after_json: null,
    },
    {
      id: "business_description",
      lane: "text",
      title: "About / business description",
      one_liner: "Thin about text.",
      priority: 8,
      severity: "medium",
      status: "todo",
      findings_json: ["f-t3"],
      before_json: { excerpts: ["Wir sind ein Familienbetrieb seit 1998."] },
      after_json: null,
    },
    {
      id: "services_copy",
      lane: "text",
      title: "Services descriptions",
      one_liner: "Generic services list.",
      priority: 6,
      severity: "medium",
      status: "todo",
      findings_json: ["f-t4"],
      before_json: { excerpts: ["Wir bieten: Heizung, Bad, Rohrreinigung."] },
      after_json: null,
    },
    {
      id: "cta_contact",
      lane: "text",
      title: "Call-to-action & contact path",
      one_liner: "No CTA anywhere.",
      priority: 20,
      severity: "high",
      status: "todo",
      findings_json: ["f-t2"],
      before_json: { excerpts: [] },
      after_json: null,
    },
    {
      id: "legal_footer",
      lane: "text",
      title: "Legal footer (Impressum/Datenschutz)",
      one_liner: "No Impressum or Datenschutz.",
      priority: 25,
      severity: "high",
      status: "todo",
      findings_json: ["f-t8"],
      before_json: { has_impressum: false, has_datenschutz: false },
      after_json: null,
    },
    {
      id: "platform_consistency",
      lane: "text",
      title: "Name, phone & address consistency",
      one_liner: "Phone mismatch across platforms.",
      priority: 15,
      severity: "high",
      status: "todo",
      findings_json: ["f-nap"],
      before_json: { website_phone: "030 1234567", gelbe_seiten_phone: "030 987654" },
      after_json: null,
    },
    {
      id: "hero_image",
      lane: "image",
      title: "Main photo",
      one_liner: "No hero shot.",
      priority: 9,
      severity: "medium",
      status: "todo",
      findings_json: ["f-coverage-hero-shot"],
      before_json: { asset_refs: [], notes: [] },
      after_json: null,
    },
    {
      id: "work_proof_images",
      lane: "image",
      title: "Work & before/after photos",
      one_liner: "No completed-job photos.",
      priority: 9,
      severity: "medium",
      status: "todo",
      findings_json: ["f-i3"],
      before_json: { asset_refs: ["web-img-1"], notes: ["No work-in-progress or completed job visible."] },
      after_json: null,
    },
    {
      id: "team_image",
      lane: "image",
      title: "Team / owner photo",
      one_liner: "No team shot.",
      priority: 9,
      severity: "medium",
      status: "todo",
      findings_json: ["f-coverage-team-shot"],
      before_json: { asset_refs: [], notes: [] },
      after_json: null,
    },
    {
      id: "image_fixes",
      lane: "image",
      title: "Fix existing photos",
      one_liner: "Dim, cluttered photos.",
      priority: 5,
      severity: "low",
      status: "todo",
      findings_json: ["f-i1"],
      before_json: { asset_refs: ["web-img-1"], notes: ["Dim, underexposed evening exterior shot; fine detail is lost in shadow."] },
      after_json: null,
    },
    {
      id: "optimized_site",
      lane: "site",
      title: "Your optimized website",
      one_liner: "See your business the way it could look.",
      priority: 999,
      severity: "high",
      status: "todo",
      findings_json: [],
      before_json: null,
      after_json: null,
    },
    {
      id: "promo_video",
      lane: "video",
      title: "Promo video",
      one_liner: "Coming soon.",
      priority: -1,
      severity: "low",
      status: "coming_soon",
      findings_json: [],
      before_json: null,
      after_json: null,
    },
  ];
  for (const row of rows) {
    const override = overrides[row.id];
    if (override) Object.assign(row, override);
  }
  return rows;
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeCompletion(content: string) {
  return { choices: [{ message: { content } }] } as never;
}

function makeFakeClient(
  create: (...args: unknown[]) => unknown,
  generate: (...args: unknown[]) => unknown,
  edit?: (...args: unknown[]) => unknown,
): OpenAI {
  return { chat: { completions: { create } }, images: { generate, edit } } as unknown as OpenAI;
}

/** Valid structured-output JSON per per-channel rewrite schema (lib/schemas.ts),
 *  keyed by the `schemaName` structuredCall passes to zodResponseFormat
 *  (lib/improve/text.ts SCHEMA_BY_TEXT_CHANNEL) — lets one fake `create` mock
 *  answer correctly for whichever channel is actually being rewritten. */
function validRewriteResponseFor(schemaName: string): string {
  switch (schemaName) {
    case "hero_headline_rewrite":
      return JSON.stringify({
        channel_id: "hero_headline",
        before_excerpt: "Sanitär Krause",
        after: {
          h1: "Bad & Heizung vom Meisterbetrieb in Berlin",
          subline: "Schnelle Hilfe, faire Preise",
          cta_text: "Jetzt anrufen",
        },
        rationale_one_liner: "Names the trade, area, and a promise up front.",
      });
    case "business_description_rewrite":
      return JSON.stringify({
        channel_id: "business_description",
        before_excerpt: "Wir sind ein Familienbetrieb seit 1998.",
        after: {
          about_paragraph: "Familienbetrieb seit 1998 für Bad und Heizung in Berlin.",
          gbp_description_de: "Sanitär Krause – Ihr Familienbetrieb seit 1998.",
          gbp_description_en: "Sanitär Krause – your family business since 1998.",
        },
        rationale_one_liner: "Adds concrete trust detail.",
      });
    case "services_copy_rewrite":
      return JSON.stringify({
        channel_id: "services_copy",
        before_excerpt: "Wir bieten: Heizung, Bad, Rohrreinigung.",
        after: {
          services: [
            { service_name: "Heizung", description: "Heizungsinstallation in Berlin." },
            { service_name: "Bad", description: "Badsanierung vom Meisterbetrieb." },
          ],
        },
        rationale_one_liner: "Adds local keywords per service.",
      });
    case "cta_contact_rewrite":
      return JSON.stringify({
        channel_id: "cta_contact",
        before_excerpt: "",
        after: { cta_text: "Jetzt anrufen — wir antworten innerhalb von 2 Stunden", contact_block_text: "030 1234567, Mo–Fr 8–18 Uhr" },
        rationale_one_liner: "Adds urgency and a real contact path.",
      });
    case "legal_footer_rewrite":
      return JSON.stringify({
        channel_id: "legal_footer",
        before_excerpt: "",
        after: {
          checklist: ["Impressum ergänzen", "Datenschutz ergänzen"],
          footer_text: "Impressum: Sanitär Krause, Musterstraße 12, 10115 Berlin.",
        },
        rationale_one_liner: "Adds legally required pages.",
      });
    case "platform_consistency_rewrite":
      return JSON.stringify({
        channel_id: "platform_consistency",
        before_excerpt: "030 1234567 vs 030 987654",
        after: { business_name: "Sanitär Krause", phone: "030 1234567", address: "Musterstraße 12, 10115 Berlin" },
        rationale_one_liner: "Uses one phone number everywhere.",
      });
    // ISS-039: every generated frame is verified as a single scene through the
    // same chat client. The fake answers honestly for a clean image.
    case "collage_verdict":
      return JSON.stringify({ is_collage: false, reason: "One single scene." });
    default:
      throw new Error(`unexpected schema name in test fake: ${schemaName}`);
  }
}

function schemaNameFromCreateArgs(args: unknown[]): string {
  return (args[0] as { response_format: { json_schema: { name: string } } }).response_format.json_schema.name;
}

function makeChatCreate() {
  return vi.fn(async (...args: unknown[]) => fakeCompletion(validRewriteResponseFor(schemaNameFromCreateArgs(args))));
}

function makeImagesGenerate() {
  return vi.fn(async () => ({ data: [{ b64_json: TINY_PNG_BASE64 }] }));
}

function seedOriginalAsset(db: Awaited<ReturnType<typeof loadDb>>, auditId: string) {
  const dir = join(storageDir, "images", auditId);
  mkdirSync(dir, { recursive: true });
  const storagePath = join(dir, "original.png");
  writeFileSync(storagePath, Buffer.from(TINY_PNG_BASE64, "base64"));
  return db.insertAsset({ audit_id: auditId, kind: "uploaded_image", storage_path: storagePath, status: "normalized" });
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// lib/improve/text.ts (F-050)
// ---------------------------------------------------------------------------

describe("lib/improve/text.ts (F-050)", () => {
  it("improveTextChannel calls the individual per-channel schema and returns a RewriteOutput-valid result", async () => {
    const create = makeChatCreate();
    const result = await improveTextChannel({
      auditId: "audit-1",
      channelId: "hero_headline",
      channelRow: { findings_json: ["f-t1"], before_json: { excerpts: ["Sanitär Krause"] } },
      business: { trade: "plumber", city: "Berlin", brand_name: "Sanitär Krause Berlin" },
      originalText: "Sanitär Krause",
      client: makeFakeClient(create, vi.fn()),
    });

    expect(() => RewriteOutput.parse(result)).not.toThrow();
    expect(result.channel_id).toBe("hero_headline");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("improveTextChannels respects concurrency <= 5 across 8 inputs", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const create = vi.fn(async (...args: unknown[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight--;
      return fakeCompletion(validRewriteResponseFor(schemaNameFromCreateArgs(args)));
    });
    const client = makeFakeClient(create, vi.fn());

    const inputs: ImproveTextChannelInput[] = Array.from({ length: 8 }, (_, i) => ({
      auditId: "audit-1",
      channelId: "cta_contact",
      channelRow: { findings_json: [], before_json: { excerpts: [] } },
      business: { trade: "plumber", city: "Berlin", brand_name: `Business ${i}` },
      originalText: "",
      client,
    }));

    const outcomes = await improveTextChannels(inputs, 5);

    expect(outcomes).toHaveLength(8);
    expect(outcomes.every((o) => o.status === "success")).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1); // proves it actually ran concurrently, not serially
    for (const outcome of outcomes) {
      if (outcome.status === "success") expect(() => RewriteOutput.parse(outcome.result)).not.toThrow();
    }
  });

  it("a channel that errors surfaces as an 'error' outcome, never a thrown exception", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network down"));
    const outcomes = await improveTextChannels(
      [
        {
          auditId: "audit-1",
          channelId: "legal_footer",
          channelRow: { findings_json: [], before_json: {} },
          business: { trade: "plumber", city: "Berlin", brand_name: "X" },
          originalText: "",
          client: makeFakeClient(create, vi.fn()),
        },
      ],
      5,
    );

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// lib/improve/image.ts (F-051/F-052/F-053)
// ---------------------------------------------------------------------------

describe("lib/improve/image.ts (F-051/F-052/F-053)", () => {
  it("generates a concept image, writes it under storage/generated, and inserts a labeled asset row", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const generate = makeImagesGenerate();

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "hero_image",
      trade: "plumber",
      client: { images: { generate } } as unknown as OpenAI,
    });

    expect(result.generation_error).toBeNull();
    expect(result.asset).not.toBeNull();
    expect(result.asset?.kind).toBe("generated_image");
    expect(result.asset?.label).toBe("ai_concept");
    expect(result.shot_brief.length).toBeGreaterThan(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2", quality: "medium" }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );

    const filePath = join(storageDir, "generated", audit.id, "hero_image.png");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath).length).toBeGreaterThan(0);

    const assets = db.listAssets(audit.id);
    expect(assets).toHaveLength(1);
    expect(assets[0]!.storage_path).toBe(join("generated", audit.id, "hero_image.png"));
    expect(assets[0]!.meta_json).toMatchObject({ channel: "hero_image", operation: "generate" });
  });

  it("enforces the 3-image cap: the 4th requested channel skips generation entirely (brief-only)", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    for (let i = 0; i < CONCEPT_IMAGE_CAP; i++) {
      db.insertAsset({ audit_id: audit.id, kind: "generated_image", label: "ai_concept", status: "generated" });
    }
    expect(countGeneratedImages(audit.id)).toBe(CONCEPT_IMAGE_CAP);

    const generate = vi.fn();
    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "team_image",
      trade: "plumber",
      client: { images: { generate } } as unknown as OpenAI,
    });

    expect(result.asset).toBeNull();
    expect(result.generation_error).toBeNull();
    expect(result.shot_brief.length).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("failure ladder: a generation error still returns a shot brief, no asset, and an honest generation_error", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const generate = vi.fn().mockRejectedValue(new Error("rate limited"));

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "work_proof_images",
      trade: "roofing",
      client: { images: { generate } } as unknown as OpenAI,
    });

    expect(result.asset).toBeNull();
    expect(result.generation_error).toContain("rate limited");
    expect(result.shot_brief).toContain("10-shot list");
    expect(db.listAssets(audit.id)).toHaveLength(0);
  });

  it("ISS-027: a failed primary generation is retried ONCE at quality=low, and a successful retry is honestly recorded", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Image generation timed out after 120000ms"))
      .mockImplementationOnce(makeImagesGenerate());

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "work_proof_images",
      trade: "roofing",
      client: { images: { generate } } as unknown as OpenAI,
    });

    expect(result.generation_error).toBeNull();
    expect(result.asset).not.toBeNull();
    // FEA-117: two channel concepts plus however many gallery fillers this
    // (image-less) fixture business needs — all still running concurrently.
    expect(generate.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(generate.mock.calls[0]![0]).toMatchObject({ quality: "medium" });
    expect(generate.mock.calls[1]![0]).toMatchObject({ quality: "low" });
    // The retry's halved timeout budget keeps a slow model at 1.5x the budget.
    expect(generate.mock.calls[1]![1].timeout).toBeLessThan(generate.mock.calls[0]![1].timeout);
    expect(result.timing).toMatchObject({ attempts: 2, downgraded: true, quality: "low" });
    expect(result.asset?.meta_json).toMatchObject({ downgraded_retry: true, quality: "low" });
  });

  it("ISS-027: the downgrade retry happens at most once — a second failure reports the PRIMARY cause", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Image generation timed out after 120000ms"))
      .mockRejectedValueOnce(new Error("still too slow"));

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "team_image",
      trade: "plumber",
      client: { images: { generate } } as unknown as OpenAI,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.asset).toBeNull();
    expect(result.generation_error).toContain("timed out");
    expect(result.generation_error).toContain("still too slow");
    expect(result.timing.attempts).toBe(2);
    expect(db.listAssets(audit.id)).toHaveLength(0);
  });

  it("edits the best real photo, preserves the source, and labels the new asset enhanced", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const source = seedOriginalAsset(db, audit.id);
    const edit = makeImagesGenerate();

    const result = await enhanceBestExistingImage({
      auditId: audit.id,
      trade: "plumber",
      client: { images: { edit } } as unknown as OpenAI,
    });

    expect(result.edit_error).toBeNull();
    expect(result.source_asset?.id).toBe(source.id);
    expect(result.asset?.label).toBe("enhanced");
    expect(result.asset?.storage_path).toBe(join("generated", audit.id, `image_fixes-${source.id}.png`));
    expect(existsSync(join(storageDir, result.asset!.storage_path!))).toBe(true);
    expect(result.asset?.meta_json).toMatchObject({ operation: "edit", source_asset_id: source.id, channel: "image_fixes" });
    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2", quality: "medium" }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(db.listAssets(audit.id)).toHaveLength(2);
  });

  it("enforces the five-output shared cap before editing a real photo", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    seedOriginalAsset(db, audit.id);
    for (let i = 0; i < GENERATED_IMAGE_CAP; i++) {
      db.insertAsset({ audit_id: audit.id, kind: "generated_image", label: i < 3 ? "ai_concept" : "enhanced", status: "generated" });
    }
    const edit = vi.fn();
    const result = await enhanceBestExistingImage({ auditId: audit.id, trade: "plumber", client: { images: { edit } } as unknown as OpenAI });
    expect(result.asset).toBeNull();
    expect(result.edit_error).toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });

  it("pickBestExistingAsset ranks real photos by summed I1-I6 score, excluding screenshots/generated", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const low = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      score_json: [{ id: "I1", score: 1, evidence: "e", source: "vision" }],
      status: "normalized",
    });
    const high = db.insertAsset({
      audit_id: audit.id,
      kind: "uploaded_image",
      score_json: [
        { id: "I1", score: 5, evidence: "e", source: "vision" },
        { id: "I2", score: 5, evidence: "e", source: "vision" },
      ],
      status: "normalized",
    });
    db.insertAsset({ audit_id: audit.id, kind: "gbp_screenshot", status: "ready" });
    db.insertAsset({ audit_id: audit.id, kind: "generated_image", label: "ai_concept", status: "generated" });

    expect(pickBestExistingAsset(audit.id)?.id).toBe(high.id);
    expect(low.id).not.toBe(high.id); // sanity: two distinct candidates were actually compared
  });

  it("ISS-008: hero_image prefers editing the business's own best real photo over generating a concept", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const source = seedOriginalAsset(db, audit.id);
    const edit = makeImagesGenerate();
    const generate = vi.fn();

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "hero_image",
      trade: "plumber",
      client: { images: { generate, edit } } as unknown as OpenAI,
    });

    expect(result.generation_error).toBeNull();
    expect(result.asset?.label).toBe("enhanced");
    expect(result.asset?.meta_json).toMatchObject({ operation: "edit", source_asset_id: source.id, channel: "hero_image" });
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ size: "1536x1024" }), expect.anything());
    expect(generate).not.toHaveBeenCalled();
  });

  it("ISS-008: hero_image falls back to concept generation (label ai_concept) when no usable real photo exists", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const generate = makeImagesGenerate();
    const edit = vi.fn();

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "hero_image",
      trade: "plumber",
      client: { images: { generate, edit } } as unknown as OpenAI,
    });

    expect(result.generation_error).toBeNull();
    expect(result.asset?.label).toBe("ai_concept");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });

  it("ISS-011: hero_image refuses to 'enhance' a tiny logo — falls back to ai_concept with an honest fallback reason", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const dir = join(storageDir, "images", audit.id);
    mkdirSync(dir, { recursive: true });
    const storagePath = join(dir, "logo.png");
    writeFileSync(storagePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      storage_path: storagePath,
      meta_json: { width: 50, height: 50 },
      status: "normalized",
    });
    const generate = makeImagesGenerate();
    const edit = vi.fn();

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "hero_image",
      trade: "plumber",
      client: { images: { generate, edit } } as unknown as OpenAI,
    });

    expect(edit).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.asset?.label).toBe("ai_concept");
    expect(result.asset?.meta_json).toMatchObject({
      hero_edit_fallback_reason: expect.stringContaining("small logos/icons"),
    });
  });

  it("ISS-011: enhanceBestExistingImage skips (honest edit_error) when the only originals are tiny logos", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const dir = join(storageDir, "images", audit.id);
    mkdirSync(dir, { recursive: true });
    const storagePath = join(dir, "logo-strip.png");
    writeFileSync(storagePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    const source = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      storage_path: storagePath,
      meta_json: { width: 270, height: 31 },
      status: "normalized",
    });
    const edit = vi.fn();

    const { enhanceBestExistingImage } = await import("../lib/improve/image");
    const result = await enhanceBestExistingImage({
      auditId: audit.id,
      trade: "plumber",
      client: { images: { edit } } as unknown as OpenAI,
    });

    expect(edit).not.toHaveBeenCalled();
    expect(result.asset).toBeNull();
    expect(result.source_asset?.id).toBe(source.id);
    expect(result.edit_error).toContain("small logos/icons");
  });

  it("ISS-019: enhanceBestExistingImage refuses a text-heavy source (would garble) and reports it honestly", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const dir = join(storageDir, "images", audit.id);
    mkdirSync(dir, { recursive: true });
    const storagePath = join(dir, "preisliste-flyer.png");
    writeFileSync(storagePath, Buffer.from(TINY_PNG_BASE64, "base64"));
    // Big enough to pass the ISS-011 size gate, but a text-bearing price-list graphic.
    const source = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      storage_path: storagePath,
      meta_json: { width: 800, height: 600, src: "preisliste-flyer.png" },
      score_json: [{ id: "I5", score: 1, evidence: "Price-list flyer with a heavy text overlay", source: "vision" }],
      status: "normalized",
    });
    const edit = vi.fn();

    const { enhanceBestExistingImage } = await import("../lib/improve/image");
    const result = await enhanceBestExistingImage({
      auditId: audit.id,
      trade: "plumber",
      client: { images: { edit } } as unknown as OpenAI,
    });

    expect(edit).not.toHaveBeenCalled();
    expect(result.asset).toBeNull();
    expect(result.source_asset?.id).toBe(source.id);
    expect(result.edit_error).toContain("text-heavy graphic");
  });

  it("ISS-011: isUsablePhotoSource gates on recorded dimensions and stays permissive when unknown", async () => {
    const { isUsablePhotoSource, MIN_EDIT_SOURCE_SHORT_EDGE } = await import("../lib/improve/image");
    const asset = (meta: Record<string, unknown> | null) => ({ meta_json: meta }) as never;
    expect(MIN_EDIT_SOURCE_SHORT_EDGE).toBe(300);
    expect(isUsablePhotoSource(asset({ width: 50, height: 50 }))).toBe(false);
    expect(isUsablePhotoSource(asset({ width: 1024, height: 299 }))).toBe(false);
    expect(isUsablePhotoSource(asset({ width: 1024, height: 768 }))).toBe(true);
    expect(isUsablePhotoSource(asset({}))).toBe(true);
    expect(isUsablePhotoSource(asset(null))).toBe(true);
  });

  it("ISS-008: an edit failure on hero_image falls back to a successful concept generation, honestly, and is NOT a channel failure", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    seedOriginalAsset(db, audit.id);
    const edit = vi.fn().mockRejectedValue(new Error("edit rejected"));
    const generate = makeImagesGenerate();

    const result = await generateChannelImage({
      auditId: audit.id,
      channelId: "hero_image",
      trade: "plumber",
      client: { images: { generate, edit } } as unknown as OpenAI,
    });

    expect(result.generation_error).toBeNull();
    expect(result.asset?.label).toBe("ai_concept");
    expect(result.asset?.meta_json).toMatchObject({ hero_edit_fallback_reason: expect.stringContaining("edit rejected") });
  });

  it("ISS-008: concept prompts are grounded in the real brand name and city when provided", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const generate = vi.fn(async (...args: unknown[]) => {
      void args;
      return { data: [{ b64_json: TINY_PNG_BASE64 }] };
    });

    await generateChannelImage({
      auditId: audit.id,
      channelId: "team_image",
      trade: "plumber",
      business: { brand_name: "Sanitär Krause Berlin", city: "Berlin", background: "Bad- und Heizungsinstallation seit 1998" },
      client: { images: { generate } } as unknown as OpenAI,
    });

    const callArgs = generate.mock.calls[0]?.[0] as { prompt: string };
    expect(callArgs.prompt).toContain("Sanitär Krause Berlin");
    expect(callArgs.prompt).toContain("Berlin");
    expect(callArgs.prompt).toContain("Do not render any text, signage, or logos");
  });

  it("ISS-007: a stuck images.generate call times out honestly instead of hanging", async () => {
    process.env.OPENAI_IMAGE_TIMEOUT_MS = "30";
    try {
      const db = await loadDb();
      const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
      const generate = vi.fn(() => new Promise(() => {})); // never resolves

      const result = await generateChannelImage({
        auditId: audit.id,
        channelId: "team_image",
        trade: "plumber",
        client: { images: { generate } } as unknown as OpenAI,
      });

      expect(result.asset).toBeNull();
      expect(result.generation_error).toContain("timed out");
    } finally {
      delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
    }
  });

  it("buildImageFixesAfter derives a crop/relight/replace instruction from the channel's findings", () => {
    const after = buildImageFixesAfter(
      {
        before_json: {
          asset_refs: ["img-1"],
          notes: ["Dim, underexposed evening exterior shot; fine detail is lost in shadow."],
        },
      },
      "plumber",
    );

    expect(after.fixes).toHaveLength(1);
    expect(after.fixes[0]!.asset_id).toBe("img-1");
    expect(after.fixes[0]!.instruction.toLowerCase()).toContain("relight");
    expect(after.shot_brief.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// lib/improve/preview.ts (F-054)
// ---------------------------------------------------------------------------

describe("lib/improve/preview.ts (F-054)", () => {
  it("assembles a fully valid PreviewJson from a mix of improved and untouched channels", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.updateAudit(audit.id, {
      evidence_json: {
        source: "fetched",
        https: true,
        title: "Sanitär Krause",
        h1: "Sanitär Krause",
        meta_description: null,
        has_viewport_meta: true,
        tel_links: ["tel:+493012345678"],
        visible_text: [
          { section: "hero", text: "Sanitär Krause" },
          { section: "footer", text: "030 1234567" },
        ],
        nav_links: [],
        has_impressum: false,
        has_datenschutz: false,
        img_candidates: [],
      },
      report_json: { reputation_chips: { review_count: 14, rating: 3.6, has_photo_reviews: null } },
    });

    const harvested1 = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      score_json: [{ id: "I1", score: 2, evidence: "e", source: "vision" }],
      status: "normalized",
    });
    db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      score_json: [{ id: "I1", score: 1, evidence: "e", source: "vision" }],
      status: "normalized",
    });
    const generated = db.insertAsset({ audit_id: audit.id, kind: "generated_image", label: "ai_concept", status: "generated" });
    const enhanced = db.insertAsset({ audit_id: audit.id, kind: "generated_image", label: "enhanced", status: "generated" });

    db.replaceChannels(
      audit.id,
      baseChannelRows({
        hero_headline: {
          status: "improved",
          after_json: {
            channel_id: "hero_headline",
            before_excerpt: "Sanitär Krause",
            after: { h1: "Bad & Heizung vom Meisterbetrieb in Berlin", subline: "Schnelle Hilfe, faire Preise", cta_text: "Jetzt anrufen" },
            rationale_one_liner: "clear promise",
          },
        },
        business_description: {
          status: "improved",
          after_json: {
            channel_id: "business_description",
            before_excerpt: "Wir sind ein Familienbetrieb seit 1998.",
            after: {
              about_paragraph: "Familienbetrieb seit 1998 für Bad und Heizung in Berlin.",
              gbp_description_de: "de",
              gbp_description_en: "en",
            },
            rationale_one_liner: "adds trust",
          },
        },
        services_copy: {
          status: "improved",
          after_json: {
            channel_id: "services_copy",
            before_excerpt: "Wir bieten: Heizung, Bad, Rohrreinigung.",
            after: {
              services: [
                { service_name: "Heizung", description: "Heizungsinstallation in Berlin." },
                { service_name: "Bad", description: "Badsanierung vom Meisterbetrieb." },
              ],
            },
            rationale_one_liner: "local keywords",
          },
        },
        cta_contact: {
          status: "improved",
          after_json: {
            channel_id: "cta_contact",
            before_excerpt: "",
            after: { cta_text: "Jetzt anrufen — wir antworten innerhalb von 2 Stunden", contact_block_text: "030 1234567" },
            rationale_one_liner: "urgency",
          },
        },
        legal_footer: {
          status: "improved",
          after_json: {
            channel_id: "legal_footer",
            before_excerpt: "",
            after: {
              checklist: ["Impressum ergänzen", "Datenschutz ergänzen"],
              footer_text: "Impressum: Sanitär Krause, Musterstraße 12, 10115 Berlin.",
            },
            rationale_one_liner: "legal hygiene",
          },
        },
        hero_image: {
          status: "improved",
          after_json: { shot_brief: "brief", best_existing_asset_id: harvested1.id, generated_asset_id: generated.id, generation_error: null },
        },
        image_fixes: {
          status: "improved",
          after_json: {
            shot_brief: "fix brief",
            fixes: [{ asset_id: harvested1.id, instruction: "relight/sharpen" }],
            source_asset_id: harvested1.id,
            enhanced_asset_id: enhanced.id,
            edit_error: null,
          },
        },
      }),
    );

    const preview = assemblePreview(audit.id);

    expect(PreviewJson.safeParse(preview).success).toBe(true);
    expect(preview.header.business_name).toBe("Sanitär Krause Berlin");
    expect(preview.hero.h1).toBe("Bad & Heizung vom Meisterbetrieb in Berlin");
    expect(preview.hero.hero_image_ref).toBe(generated.id);
    // ISS-028: a genuinely generated hero is labeled as such, with no error reason.
    expect(preview.hero.image_source).toBe("generated");
    expect(preview.hero.generation_error_reason).toBeUndefined();
    expect(preview.trust_bar.review_chip).toBe("3.6★ (14 reviews)");
    expect(preview.trust_bar.years_in_business).toBe("seit 1998");
    expect(preview.services).toHaveLength(3);
    expect(preview.services[0]).toEqual({ title: "Heizung", description: "Heizungsinstallation in Berlin." });
    expect(preview.contact.phone).toBe("+493012345678");
    expect(preview.contact.cta).toBe("Jetzt anrufen — wir antworten innerhalb von 2 Stunden");
    expect(preview.legal_footer.impressum).toContain("Impressum:");
    expect(preview.legal_footer.datenschutz).toBe("Impressum ergänzen; Datenschutz ergänzen");
    // ISS-035: the hero already shows the generated concept, so the gallery no
    // longer repeats it — one picture, one place on the page.
    expect(preview.hero.hero_image_ref).toBe(generated.id);
    expect(preview.gallery.some((g) => g.asset_ref === generated.id)).toBe(false);
    // The enhanced image is different content and still appears...
    const shownRefs = [preview.hero.hero_image_ref, preview.about_team.team_image_ref, ...preview.gallery.map((g) => g.asset_ref)];
    expect(shownRefs).toContain(enhanced.id);
    // (This fixture's `enhanced` row carries no `source_asset_id`, so there is
    //  no lineage to collapse — ISS-035 never removes what it cannot prove is a
    //  duplicate. The lineage rules themselves are pinned in tests/taxonomy.test.ts.)
    expect(preview.what_changed).toEqual([
      "Headline rewritten",
      "About section rewritten",
      "Services descriptions rewritten",
      "Call-to-action added",
      "Impressum & Datenschutz guidance added",
      "1 image upgraded (AI concept)",
      "1 real photo enhanced",
    ]);
    expect(preview.before.sections).toHaveLength(2);
    expect(preview.before.original_image_refs).toEqual(expect.arrayContaining([harvested1.id]));
  });

  it("ISS-028: a failed generation that falls back to a harvested photo is labeled harvested_fallback with a whitelisted reason", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    const harvested = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      score_json: [{ id: "I1", score: 2, evidence: "e", source: "vision" }],
      status: "normalized",
    });
    db.replaceChannels(
      audit.id,
      baseChannelRows({
        hero_image: {
          status: "improved",
          after_json: {
            shot_brief: "brief",
            best_existing_asset_id: harvested.id,
            generated_asset_id: null,
            // The exact shape lib/improve/image.ts writes on a timeout.
            generation_error: "Image generation failed: Image generation timed out after 120000ms",
          },
        },
        team_image: {
          status: "improved",
          after_json: {
            shot_brief: "brief",
            best_existing_asset_id: null,
            generated_asset_id: null,
            generation_error: "Image generation failed: 500 server error from provider",
          },
        },
      }),
    );

    const preview = assemblePreview(audit.id);

    expect(PreviewJson.safeParse(preview).success).toBe(true);
    // F-054 is untouched: the preview still shows a photo, it is just honest now.
    expect(preview.hero.hero_image_ref).toBe(harvested.id);
    expect(preview.hero.image_source).toBe("harvested_fallback");
    expect(preview.hero.generation_error_reason).toBe("timeout");
    // The audit-wide fallback rung reports itself the same way.
    expect(preview.about_team.team_image_ref).toBe(harvested.id);
    expect(preview.about_team.image_source).toBe("harvested_fallback");
    expect(preview.about_team.generation_error_reason).toBe("api_error");
    // The raw provider message never reaches preview_json.
    expect(JSON.stringify(preview)).not.toContain("120000ms");
  });

  it("ISS-028: normalizeGenerationErrorReason only ever emits whitelisted codes", () => {
    expect(normalizeGenerationErrorReason("Image generation failed: Image generation timed out after 120000ms")).toBe("timeout");
    expect(normalizeGenerationErrorReason("Image generation failed: OpenAI image generation returned no image data.")).toBe(
      "no_image_data",
    );
    expect(normalizeGenerationErrorReason("OpenAI client requested but OPENAI_API_KEY is not set.")).toBe("missing_api_key");
    expect(normalizeGenerationErrorReason("Image generation failed: 429 rate limit")).toBe("api_error");
    expect(normalizeGenerationErrorReason("something nobody anticipated")).toBe("unknown");
    expect(normalizeGenerationErrorReason(null)).toBeNull();
    expect(normalizeGenerationErrorReason("")).toBeNull();
  });

  it("degrades to a valid text-only PreviewJson when zero images are available", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.replaceChannels(audit.id, baseChannelRows());

    const preview = assemblePreview(audit.id);

    expect(PreviewJson.safeParse(preview).success).toBe(true);
    expect(preview.hero.hero_image_ref).toBeNull();
    expect(preview.about_team.team_image_ref).toBeNull();
    expect(preview.gallery).toEqual([]);
    expect(preview.services).toHaveLength(3);
    expect(preview.what_changed).toEqual([]);
  });

  it("ISS-017: the After gallery excludes weak originals but keeps high-value ones; the Before panel keeps every original", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });

    const weak = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      meta_json: { width: 300, height: 264 },
      score_json: [{ id: "I1", score: 1, evidence: "e", source: "vision" }],
      status: "normalized",
    });
    const good = db.insertAsset({
      audit_id: audit.id,
      kind: "harvested_image",
      meta_json: { width: 1200, height: 800, alt: "finished bathroom" },
      score_json: ["I1", "I2", "I3", "I4", "I5", "I6"].map((id) => ({ id, score: 4, evidence: "e", source: "vision" })),
      status: "normalized",
    });
    const concept = db.insertAsset({ audit_id: audit.id, kind: "generated_image", label: "ai_concept", status: "generated" });

    db.replaceChannels(
      audit.id,
      baseChannelRows({
        work_proof_images: {
          status: "improved",
          after_json: { shot_brief: "b", best_existing_asset_id: good.id, generated_asset_id: concept.id, generation_error: null },
        },
      }),
    );

    const preview = assemblePreview(audit.id);
    const galleryRefs = preview.gallery.map((g) => g.asset_ref);

    expect(galleryRefs).toContain(concept.id); // new AI concept always shown
    // ISS-017's guarantee is that the high-value original is SHOWN on the After
    // page and the weak one is not. ISS-035 then decides WHERE: a picture
    // appears once, so a good original used by the about/team slot is not
    // repeated as a gallery tile.
    const shown = [preview.hero.hero_image_ref, preview.about_team.team_image_ref, ...galleryRefs];
    expect(shown).toContain(good.id);
    expect(shown).not.toContain(weak.id);
    expect(galleryRefs).not.toContain(weak.id); // weak original excluded from After
    // Before panel is "what customers see today" — it keeps every original.
    expect(preview.before.original_image_refs).toEqual(expect.arrayContaining([weak.id, good.id]));
  });
});

// ---------------------------------------------------------------------------
// lib/improve/orchestrate.ts (F-045/F-055)
// ---------------------------------------------------------------------------

describe("lib/improve/orchestrate.ts runImprove (F-045/F-055)", () => {
  it("FEA-112: the report and preview complete while images are STILL generating", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.replaceChannels(audit.id, baseChannelRows());
    seedOriginalAsset(db, audit.id);

    // Image calls that never settle until we release them — this is the whole
    // point of FEA-112: a slow gpt-image-2 call must not hold the report back.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generate = vi.fn(async () => {
      await held;
      return { data: [{ b64_json: TINY_PNG_BASE64 }] };
    });
    const client = makeFakeClient(makeChatCreate(), generate, generate);

    const runPromise = runImprove(audit.id, "all", { client });

    // Wait for the text lane + early assembly to land, images still in flight.
    for (let i = 0; i < 200 && db.getAudit(audit.id)?.status !== "complete"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const midRun = db.getAudit(audit.id);
    expect(midRun?.status).toBe("complete");
    expect(midRun?.preview_json).toBeTruthy();
    expect(PreviewJson.safeParse(midRun?.preview_json).success).toBe(true);
    const midChannels = db.listChannels(audit.id);
    // Text is done...
    expect(midChannels.find((c) => c.id === "hero_headline")?.status).toBe("improved");
    // ...images are honestly still running (the UI's "generating" placeholder).
    expect(midChannels.find((c) => c.id === "hero_image")?.status).toBe("improving");
    expect(db.listAssets(audit.id).filter((a) => a.kind === "generated_image")).toHaveLength(0);

    release();
    await runPromise;

    const finalChannels = db.listChannels(audit.id);
    expect(finalChannels.find((c) => c.id === "hero_image")?.status).toBe("improved");
    expect(db.listAssets(audit.id).filter((a) => a.kind === "generated_image").length).toBeGreaterThan(0);
    expect(db.getAudit(audit.id)?.status).toBe("complete");
  });

  it("FEA-112: a streamed partial image is published against the channel and replaced in place by the final frame", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.replaceChannels(audit.id, baseChannelRows());

    let releaseFinal!: () => void;
    const finalHeld = new Promise<void>((resolve) => {
      releaseFinal = resolve;
    });
    // A fake provider stream: one partial, then the final frame once released.
    const generate = vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        yield { type: "image_generation.partial_image", partial_image_index: 0, b64_json: TINY_PNG_BASE64 };
        await finalHeld;
        yield { type: "image_generation.completed", b64_json: TINY_PNG_BASE64 };
      },
    }));
    const client = makeFakeClient(makeChatCreate(), generate, generate);

    // ISS-040: ONE channel, no `optimized_site` — this is deliberately not a
    // full page rebuild, so exactly one image is generated and the partial/final
    // bookkeeping under test is unambiguous.
    const runPromise = runImprove(audit.id, ["hero_image"], { client });

    for (let i = 0; i < 200 && db.listAssets(audit.id).length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // The partial is a real generated asset, truthfully flagged, and already
    // referenced by the channel — while the channel still reads "improving".
    const partialAssets = db.listAssets(audit.id).filter((a) => a.kind === "generated_image");
    expect(partialAssets).toHaveLength(1);
    expect(partialAssets[0]!.label).toBe("ai_concept");
    expect(partialAssets[0]!.meta_json).toMatchObject({ partial: true });
    const midChannel = db.listChannels(audit.id).find((c) => c.id === "hero_image");
    expect(midChannel?.status).toBe("improving");
    expect((midChannel?.after_json as { generated_asset_id?: string }).generated_asset_id).toBe(partialAssets[0]!.id);

    releaseFinal();
    await runPromise;

    // The final frame REPLACES the partial in place — same id, no duplicate row.
    const finalAssets = db.listAssets(audit.id).filter((a) => a.kind === "generated_image");
    expect(finalAssets).toHaveLength(1);
    expect(finalAssets[0]!.id).toBe(partialAssets[0]!.id);
    expect(finalAssets[0]!.meta_json).not.toMatchObject({ partial: true });
    expect(finalAssets[0]!.meta_json).toMatchObject({ partial_ms: expect.any(Number) });
    expect(db.listChannels(audit.id).find((c) => c.id === "hero_image")?.status).toBe("improved");
  });

  it("'all' flow: improving -> complete, exact progress step order, optimized_site improved, preview_json persisted", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.replaceChannels(audit.id, baseChannelRows());
    seedOriginalAsset(db, audit.id);

    const create = makeChatCreate();
    const generate = makeImagesGenerate();
    const edit = makeImagesGenerate();
    const client = makeFakeClient(create, generate, edit);

    const runPromise = runImprove(audit.id, "all", { client });
    // runImprove flips status synchronously before its first await.
    expect(db.getAudit(audit.id)?.status).toBe("improving");

    await runPromise;

    const finalAudit = db.getAudit(audit.id);
    expect(finalAudit?.status).toBe("complete");
    expect(finalAudit?.preview_json).toBeTruthy();
    expect(PreviewJson.safeParse(finalAudit?.preview_json).success).toBe(true);

    // ISS-027: `generating_images` emits one extra detail event per image
    // channel (its real duration). FEA-112: the preview is assembled BEFORE the
    // images finish and refreshed after, so `assembling_preview` legitimately
    // occurs twice — the guarantee under test is the step SEQUENCE, not counts.
    const events = db.listProgressEvents(audit.id);
    const stepOrder = events.map((e) => e.step).filter((step, i, all) => step !== all[i - 1]);
    expect(stepOrder).toEqual([
      "rewriting_text",
      "generating_images",
      "assembling_preview",
      "generating_images",
      "assembling_preview",
      "done",
    ]);
    // ISS-027 regression guard: each image channel's cost is recorded.
    const timingDetails = events.filter((e) => e.step === "generating_images" && /\bin \d+\.\ds \(/.test(e.detail ?? ""));
    expect(timingDetails.length).toBeGreaterThanOrEqual(3);

    const channels = db.listChannels(audit.id);
    expect(channels.find((c) => c.id === "optimized_site")?.status).toBe("improved");
    for (const id of [
      "hero_headline",
      "business_description",
      "services_copy",
      "cta_contact",
      "legal_footer",
      "platform_consistency",
      "hero_image",
      "team_image",
      "work_proof_images",
      "image_fixes",
    ]) {
      expect(channels.find((c) => c.id === id)?.status, id).toBe("improved");
    }
    expect(channels.find((c) => c.id === "promo_video")?.status).toBe("coming_soon");

    // 6 text channels + ISS-039's one single-scene verification per GENERATED
    // (not edited) image.
    const generatedConcepts = db
      .listAssets(audit.id)
      .filter((a) => a.kind === "generated_image" && a.label === "ai_concept").length;
    expect(create).toHaveBeenCalledTimes(6 + generatedConcepts);
    // ISS-008: hero_image PREFERS editing the seeded real photo, so team_image
    // + work_proof_images go through concept generation. FEA-117 then tops the
    // gallery up to its minimum with extra, distinct filler images — this is a
    // full "Do It For You" run, so filling is expected.
    const fillerCalls = db
      .listAssets(audit.id)
      .filter((a) => (a.meta_json as { gallery_filler?: unknown } | null)?.gallery_filler === true).length;
    expect(generate).toHaveBeenCalledTimes(2 + fillerCalls);
    expect(fillerCalls).toBeGreaterThan(0);
    expect(edit).toHaveBeenCalledTimes(2); // hero_image (edit-preferred) + image_fixes

    const generatedAssets = db.listAssets(audit.id).filter((a) => a.kind === "generated_image");
    // 2 concepts + 2 edits (hero + image_fixes) + FEA-117's gallery fillers.
    const fillers = generatedAssets.filter((a) => (a.meta_json as { gallery_filler?: unknown } | null)?.gallery_filler === true);
    expect(generatedAssets).toHaveLength(4 + fillers.length);
    expect(generatedAssets.filter((asset) => asset.label === "ai_concept")).toHaveLength(2 + fillers.length);
    expect(generatedAssets.filter((asset) => asset.label === "enhanced")).toHaveLength(2);

    const heroAfter = channels.find((c) => c.id === "hero_image")?.after_json as {
      generated_asset_id?: string;
      generation_error?: string | null;
    };
    const heroAsset = generatedAssets.find((asset) => asset.id === heroAfter.generated_asset_id);
    expect(heroAsset?.label).toBe("enhanced");
    expect(heroAfter.generation_error).toBeNull();

    const imageFixesAfter = channels.find((c) => c.id === "image_fixes")?.after_json as {
      source_asset_id?: string;
      enhanced_asset_id?: string;
      edit_error?: string | null;
    };
    expect(imageFixesAfter.source_asset_id).toBeTruthy();
    const imageFixesAsset = generatedAssets.find((asset) => asset.id === imageFixesAfter.enhanced_asset_id);
    expect(imageFixesAsset?.label).toBe("enhanced");
    expect(imageFixesAfter.edit_error).toBeNull();
    // ISS-035: hero_image and image_fixes both edited the audit's ONE original
    // photo, so the page holds a single image from that lineage (before the
    // fix, both twins were shown, side by side, plus the hero) — while
    // what_changed still reports the real work that was done.
    const finalPreview = finalAudit?.preview_json as PreviewJson;
    const shownRefs = [
      finalPreview.hero.hero_image_ref,
      finalPreview.about_team.team_image_ref,
      ...finalPreview.gallery.map((g) => g.asset_ref),
    ].filter((ref): ref is string => typeof ref === "string");
    const lineageRefs = new Set([heroAfter.generated_asset_id, imageFixesAfter.enhanced_asset_id, imageFixesAfter.source_asset_id]);
    expect(shownRefs.filter((ref) => lineageRefs.has(ref))).toHaveLength(1);
    expect(finalAudit?.preview_json).toMatchObject({
      what_changed: expect.arrayContaining(["1 real photo enhanced"]),
    });
  });

  it("ISS-006: parallelizes the generating_images stage — total elapsed is well under the serial sum", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.replaceChannels(audit.id, baseChannelRows());
    seedOriginalAsset(db, audit.id);

    const create = makeChatCreate();
    const slow = () =>
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { data: [{ b64_json: TINY_PNG_BASE64 }] };
      });
    const generate = slow();
    const edit = slow();
    const client = makeFakeClient(create, generate, edit);

    const start = Date.now();
    await runImprove(audit.id, "all", { client });
    const elapsed = Date.now() - start;

    // hero_image (edit) + image_fixes (edit) + team_image/work_proof_images
    // (generate) all run concurrently, each taking ~100ms — a serial run
    // would take 4 * 100ms = 400ms+; parallel keeps this well under that.
    // FEA-117 adds gallery fillers to a full run; they are part of the same
    // concurrent batch, which is exactly what this timing guard checks.
    expect(generate.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeLessThan(350);
  });

  it("ISS-007: a stuck image call times out honestly and the whole run still completes (never hangs)", async () => {
    process.env.OPENAI_IMAGE_TIMEOUT_MS = "30";
    try {
      const db = await loadDb();
      const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
      db.replaceChannels(audit.id, baseChannelRows());

      const create = makeChatCreate();
      const generate = vi.fn(() => new Promise(() => {})); // never resolves
      const client = makeFakeClient(create, generate);

      await runImprove(audit.id, "all", { client });

      const finalAudit = db.getAudit(audit.id);
      // Text channels + optimized_site still succeed; only the image
      // channels time out — never a wipeout, so the run still completes.
      expect(finalAudit?.status).toBe("complete");

      const heroAfter = db.listChannels(audit.id).find((c) => c.id === "hero_image")?.after_json as {
        generation_error?: string | null;
      };
      expect(heroAfter.generation_error).toContain("timed out");
    } finally {
      delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
    }
  });

  it("single-channel selection ends 'scored' with no preview_json persisted", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.replaceChannels(audit.id, baseChannelRows());

    const create = makeChatCreate();
    const generate = makeImagesGenerate();

    await runImprove(audit.id, ["cta_contact"], { client: makeFakeClient(create, generate) });

    const finalAudit = db.getAudit(audit.id);
    expect(finalAudit?.status).toBe("scored");
    expect(finalAudit?.preview_json).toBeNull();

    const channel = db.listChannels(audit.id).find((c) => c.id === "cta_contact");
    expect(channel?.status).toBe("improved");
    expect(create).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it("REPLAY mode never constructs/calls a client and stays honest when the fixture has no recorded improvement", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "REPLAY" });
    db.replaceChannels(audit.id, baseChannelRows());

    const create = vi.fn();
    const generate = vi.fn();

    const fixtureAfterIds = new Set(
      replayFixture.report.channels.filter((channel) => channel.after !== null).map((channel) => channel.id)
    );
    const missingChannelId = baseChannelRows()
      .map((channel) => channel.id)
      .find(
        (id) => id !== "optimized_site" && id !== "promo_video" && !fixtureAfterIds.has(id)
      );
    expect(missingChannelId, "the recorded LIVE audit should leave at least one catalog channel absent").toBeTruthy();

    await runImprove(audit.id, [missingChannelId!], {
      client: makeFakeClient(create, generate),
      replayStepDelayMs: 0,
    });

    expect(create).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();

    const finalAudit = db.getAudit(audit.id);
    expect(finalAudit?.status).toBe("scored");
    const events = db.listProgressEvents(audit.id);
    const steps = events.map((event) => event.step);
    expect(steps[0]).toBe("rewriting_text");
    expect(steps).toContain("generating_images");
    expect(steps).toContain("assembling_preview");
    expect(steps.at(-1)).toBe("done");
    expect(events.some((event) => event.detail?.includes(`no recorded improvement for ${missingChannelId}`))).toBe(true);

    const channel = db.listChannels(audit.id).find((candidate) => candidate.id === missingChannelId);
    expect(channel?.status).toBe("todo");
  });

  it("REPLAY mode flips a channel to improved from the F-082 fixture's recorded after content", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "REPLAY" });
    db.replaceChannels(audit.id, baseChannelRows());

    const create = vi.fn();
    const generate = vi.fn();

    await runImprove(audit.id, ["hero_headline"], { client: makeFakeClient(create, generate), replayStepDelayMs: 0 });

    expect(create).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();

    const channel = db.listChannels(audit.id).find((c) => c.id === "hero_headline");
    expect(channel?.status).toBe("improved");
    const after = channel?.after_json as { channel_id: string; after: { h1: string } } | null;
    expect(after?.channel_id).toBe("hero_headline");
    const recorded = replayFixture.report.channels.find((candidate) => candidate.id === "hero_headline")?.after as
      | { channel_id: string; after: { h1: string } }
      | null
      | undefined;
    expect(after?.after.h1).toBe(recorded?.after.h1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/audits/:id/improve (F-045 route)
// ---------------------------------------------------------------------------

describe("POST /api/audits/:id/improve (F-045)", () => {
  it("404s for an unknown audit", async () => {
    const req = jsonRequest("http://localhost/api/audits/does-not-exist/improve", { channels: "all" });
    const res = await improve_POST(req, idParams("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("409s when the audit is not scored/complete yet", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" }); // status defaults to "draft"

    const res = await improve_POST(jsonRequest(`http://localhost/api/audits/${audit.id}/improve`, { channels: "all" }), idParams(audit.id));
    expect(res.status).toBe(409);
  });

  it("400s on an empty channels array", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.updateAudit(audit.id, { status: "scored" });

    const res = await improve_POST(jsonRequest(`http://localhost/api/audits/${audit.id}/improve`, { channels: [] }), idParams(audit.id));
    expect(res.status).toBe(400);
  });

  it("400s on an unknown channel id", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.updateAudit(audit.id, { status: "scored" });
    db.replaceChannels(audit.id, baseChannelRows());

    const res = await improve_POST(
      jsonRequest(`http://localhost/api/audits/${audit.id}/improve`, { channels: ["not_a_real_channel"] }),
      idParams(audit.id),
    );
    expect(res.status).toBe(400);
  });

  it("400s when promo_video is explicitly requested (disabled channel)", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.updateAudit(audit.id, { status: "scored" });
    db.replaceChannels(audit.id, baseChannelRows());

    const res = await improve_POST(
      jsonRequest(`http://localhost/api/audits/${audit.id}/improve`, { channels: ["promo_video"] }),
      idParams(audit.id),
    );
    expect(res.status).toBe(400);
  });

  it("202s with an immediate 'improving' response body for a valid single-channel request", async () => {
    // NOTE: does not re-query the DB after the response like the analyze
    // route's equivalent test avoids doing (tests/api.test.ts) — without an
    // injected client, the fire-and-forget engine has no real network I/O to
    // wait on (no OPENAI_API_KEY -> an immediate AgentCallError) and can
    // finish within the same microtask flush as awaiting this response,
    // reverting status back to "scored" before a DB re-check would run.
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.updateAudit(audit.id, { status: "scored" });
    db.replaceChannels(audit.id, baseChannelRows());

    const res = await improve_POST(
      jsonRequest(`http://localhost/api/audits/${audit.id}/improve`, { channels: ["cta_contact"] }),
      idParams(audit.id),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("improving");
  });

  it("honestly completes without a fake client (no OPENAI_API_KEY) via the exported test wrapper — never 'failed'", async () => {
    const db = await loadDb();
    const audit = db.createAudit({ business_json: seedBusiness(), execution_mode: "LIVE" });
    db.updateAudit(audit.id, { status: "scored" });
    db.replaceChannels(audit.id, baseChannelRows());

    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    await runImproveAndLogCrash(audit.id, ["cta_contact"]);

    const finalAudit = db.getAudit(audit.id);
    // No key -> AgentCallError on the one requested channel -> total wipeout -> honest "scored", never "failed".
    expect(finalAudit?.status).toBe("scored");
    const channel = db.listChannels(audit.id).find((c) => c.id === "cta_contact");
    expect(channel?.status).toBe("todo");
  });
});
