// Tests for lib/pipeline/orchestrator.ts (F-043) + lib/pipeline/gbp.ts's
// pure precedence merge (F-025). Three groups:
//   1. mergeGbpPrecedence — pure function, no I/O.
//   2. REPLAY branch — the real fixture, zero mocked-module calls.
//   3. LIVE branch — every network/model module mocked; lib/pipeline/images.ts
//      and lib/pipeline/gbp.ts stay REAL (safe: no candidates means no real
//      network in harvestImages, and gbp.ts's only external call —
//      runGbpExtraction — is itself the mocked experts.ts export).
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "../lib/fixtures/replay-audit.json";
import { mergeGbpPrecedence } from "../lib/pipeline/gbp";
import type {
  BusinessInput,
  CopyStrategistOutput,
  PortalEvidence,
  PortalPlatform,
  SynthesizerOutput,
  TavilyFindability,
  VisualDirectorOutput,
  WebsiteEvidence,
} from "../lib/schemas";

vi.mock("../lib/pipeline/website", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pipeline/website")>();
  return { ...actual, fetchWebsiteEvidence: vi.fn(), fetchPortalEvidence: vi.fn() };
});

vi.mock("../lib/pipeline/tavily", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pipeline/tavily")>();
  return { ...actual, checkFindability: vi.fn() };
});

vi.mock("../lib/pipeline/screenshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pipeline/screenshot")>();
  return { ...actual, captureWebsiteScreenshot: vi.fn() };
});

vi.mock("../lib/agents/experts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/agents/experts")>();
  return {
    ...actual,
    runCopyStrategist: vi.fn(),
    runVisualDirector: vi.fn(),
    runSynthesizer: vi.fn(),
    runGbpExtraction: vi.fn(),
  };
});

vi.mock("../lib/memory/cognee", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/memory/cognee")>();
  return { ...actual, addAuditMemory: vi.fn(), findSimilarAudits: vi.fn() };
});

import { fetchPortalEvidence, fetchWebsiteEvidence } from "../lib/pipeline/website";
import { checkFindability } from "../lib/pipeline/tavily";
import { captureWebsiteScreenshot } from "../lib/pipeline/screenshot";
import { runCopyStrategist, runGbpExtraction, runSynthesizer, runVisualDirector } from "../lib/agents/experts";
import { addAuditMemory, findSimilarAudits } from "../lib/memory/cognee";
import { runAnalyzePipeline } from "../lib/pipeline/orchestrator";

// A valid 1x1 PNG — same bytes tests/api.test.ts uses for upload fixtures.
const TEST_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let tmpDir: string;
let storageDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-orchestrator-test-"));
  storageDir = join(tmpDir, "storage");
  process.env.APP_DB_PATH = join(tmpDir, "app.db");
  process.env.APP_STORAGE_DIR = storageDir;
  process.env.REPLAY_STEP_DELAY_MS = "1";
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
  vi.resetAllMocks();
});

afterEach(async () => {
  const dbModule = await import("../lib/db");
  dbModule.closeDb();
  delete process.env.APP_DB_PATH;
  delete process.env.APP_STORAGE_DIR;
  delete process.env.REPLAY_STEP_DELAY_MS;
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. mergeGbpPrecedence (F-025) — pure, no I/O
// ---------------------------------------------------------------------------

describe("mergeGbpPrecedence (F-025 precedence merge)", () => {
  it("returns null when there is no GBP signal at all", () => {
    expect(mergeGbpPrecedence(null, null, false)).toBeNull();
  });

  it("returns source 'link' with no fields when only a Maps link is present", () => {
    expect(mergeGbpPrecedence(null, null, true)).toEqual({ source: "link" });
  });

  it("an empty manual object with a Maps link still counts as link-only (no manual fields set)", () => {
    expect(mergeGbpPrecedence({}, null, true)).toEqual({ source: "link" });
  });

  it("returns source 'screenshot' with extracted fields when only screenshot data is present", () => {
    const extracted = { review_count: 14, rating: 3.6, has_photo_reviews: false, description: "Screenshot description." };
    expect(mergeGbpPrecedence(null, extracted, false)).toEqual({
      review_count: 14,
      rating: 3.6,
      has_photo_reviews: false,
      description: "Screenshot description.",
      source: "screenshot",
    });
  });

  it("manual fields win over screenshot fields field-by-field (source 'manual')", () => {
    const manual = { review_count: 20, description: "Manual description." };
    const extracted = { review_count: 14, rating: 3.6, has_photo_reviews: true, description: "Screenshot description." };

    const result = mergeGbpPrecedence(manual, extracted, true);

    expect(result?.source).toBe("manual");
    expect(result?.review_count).toBe(20); // manual wins
    expect(result?.description).toBe("Manual description."); // manual wins
    expect(result?.rating).toBe(3.6); // falls back to screenshot (manual has no rating)
    expect(result?.has_photo_reviews).toBe(true); // screenshot-only field, no manual equivalent exists
  });

  it("all-null extracted fields do not override a manual field, and source stays 'manual'", () => {
    const manual = { rating: 4.2 };
    const extracted = { review_count: null, rating: null, has_photo_reviews: null, description: null };
    expect(mergeGbpPrecedence(manual, extracted, false)).toEqual({ rating: 4.2, source: "manual" });
  });
});

// ---------------------------------------------------------------------------
// 2. REPLAY branch (F-080) — zero live calls, ever
// ---------------------------------------------------------------------------

describe("runAnalyzePipeline — REPLAY branch", () => {
  it("scores the audit end-to-end from the fixture, in exact progress order, with zero live-module calls", async () => {
    const { createAudit, getAudit, listAssets, listChannels, listProgressEvents } = await import("../lib/db");
    const audit = createAudit({ business_json: fixture.business, execution_mode: "REPLAY" });

    await runAnalyzePipeline(audit.id);

    const updated = getAudit(audit.id);
    expect(updated?.status).toBe("scored");
    expect(updated?.overall_score).toBe(fixture.report.overall_score);
    expect(updated?.report_json).toEqual(fixture.report);
    expect(updated?.execution_mode).toBe("REPLAY"); // never touched — badge stays truthful

    expect(listProgressEvents(audit.id).map((e) => e.step)).toEqual([
      "reading_site",
      "collecting_images",
      "checking_local_search",
      "recalling_similar_audits",
      "experts_scoring",
      "building_channels",
      "done",
    ]);

    const channels = listChannels(audit.id);
    expect(channels.map((c) => c.id)).toEqual(fixture.report.channels.map((c) => c.id));
    expect(channels.map((c) => c.one_liner)).toEqual(fixture.report.channels.map((c) => c.one_liner));
    expect(channels.map((c) => c.before_json)).toEqual(fixture.report.channels.map((c) => c.before));

    const assets = listAssets(audit.id);
    expect(assets).toHaveLength(fixture.assets.length);
    expect(assets.map((a) => a.kind)).toEqual(fixture.assets.map((a) => a.kind));
    expect(assets.map((a) => a.label)).toEqual(fixture.assets.map((a) => a.label));
    expect(assets.map((a) => a.storage_path)).toEqual(fixture.assets.map((a) => a.storage_path));
    expect(assets.map((a) => (a.meta_json as Record<string, unknown>).replay_fixture_asset_id)).toEqual(
      fixture.assets.map((a) => a.id)
    );

    expect(fetchWebsiteEvidence).not.toHaveBeenCalled();
    expect(fetchPortalEvidence).not.toHaveBeenCalled();
    expect(checkFindability).not.toHaveBeenCalled();
    expect(captureWebsiteScreenshot).not.toHaveBeenCalled();
    expect(runCopyStrategist).not.toHaveBeenCalled();
    expect(runVisualDirector).not.toHaveBeenCalled();
    expect(runSynthesizer).not.toHaveBeenCalled();
    expect(runGbpExtraction).not.toHaveBeenCalled();
    expect(findSimilarAudits).not.toHaveBeenCalled();
    expect(addAuditMemory).not.toHaveBeenCalled();
  });
});

describe("runAnalyzePipeline — entry point", () => {
  it("rejects for an unknown audit id rather than silently no-op'ing", async () => {
    await expect(runAnalyzePipeline("does-not-exist")).rejects.toThrow(/No audit found/);
  });
});

// ---------------------------------------------------------------------------
// 3. LIVE branch — pipeline/agents modules mocked
// ---------------------------------------------------------------------------

const LIVE_BUSINESS: BusinessInput = {
  brand_name: "Acme Plumbing",
  trade: "plumber",
  city: "Berlin",
  presence: {
    website: "https://acme-plumbing.example",
    yellow_pages: "https://gelbeseiten.example/acme",
  },
  pasted_text: "We fix pipes fast, every day of the week.",
  gbp_manual: { description: "Family business since 1998." },
};

const WEBSITE_EVIDENCE: WebsiteEvidence = {
  source: "fetched",
  https: true,
  title: "Acme Plumbing",
  h1: "Acme Plumbing — fast local plumbers",
  meta_description: "Fast plumbing in Berlin",
  has_viewport_meta: true,
  tel_links: ["tel:+493012345678"],
  visible_text: [
    { section: "hero", text: "Acme Plumbing — fast, friendly plumbers in Berlin." },
    { section: "about", text: "Family-run business serving Berlin since 1998." },
    { section: "footer", text: "Impressum Datenschutz 030 1234567" },
  ],
  nav_links: [],
  has_impressum: true,
  has_datenschutz: true,
  img_candidates: [], // keep harvestImages a no-op — no real network in tests
};

const PORTAL_EVIDENCE: PortalEvidence = {
  platform: "yellow_pages",
  url: "https://gelbeseiten.example/acme",
  source: "fetched",
  visible_text: "Acme Plumbing — Gelbe Seiten listing. Reliable plumber in Berlin.",
  brand_name: "Acme Plumbing",
  phone: "030 1234567",
  address: "Musterstr. 1, 10115 Berlin",
};

const FINDABILITY_FOUND: TavilyFindability = {
  status: "found",
  results: [{ title: "Acme Plumbing", url: "https://acme-plumbing.example" }],
  source: "tavily",
};

const TEXT_CRITERION_IDS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"] as const;

function buildCopyOutput(t1Score = 4): CopyStrategistOutput {
  return {
    criteria: TEXT_CRITERION_IDS.map((id) => ({
      id,
      score: id === "T1" ? t1Score : 4,
      evidence: id === "T1" ? "Homepage only shows the business name, nothing else." : `${id} looks fine.`,
      source: "fetched" as const,
    })),
    findings:
      t1Score <= 2
        ? [
            {
              criterion: "T1",
              severity: "high" as const,
              evidence_quote: "Homepage only shows the business name, nothing else.",
              impact: 5,
              effort: 2,
            },
          ]
        : [],
  };
}

const VISUAL_OUTPUT_EMPTY: VisualDirectorOutput = { images: [], coverage_gaps: [], red_flags: [] };

function buildSynthOutput(overrides: Partial<SynthesizerOutput> = {}): SynthesizerOutput {
  return {
    executive_summary: "Solid trust signals, weak digital presence.",
    channel_one_liners: [],
    memory_note: null,
    ...overrides,
  };
}

interface HappyPathOptions {
  t1Score?: number;
  portalImpl?: (url: string, platform: PortalPlatform) => Promise<PortalEvidence | null>;
}

function setupHappyPathMocks(options: HappyPathOptions = {}) {
  vi.mocked(fetchWebsiteEvidence).mockResolvedValue({ evidence: WEBSITE_EVIDENCE, imageSources: new Map() });
  vi.mocked(fetchPortalEvidence).mockImplementation(options.portalImpl ?? (async () => PORTAL_EVIDENCE));
  vi.mocked(checkFindability).mockResolvedValue(FINDABILITY_FOUND);
  vi.mocked(captureWebsiteScreenshot).mockResolvedValue({
    ok: true,
    execution_mode: "LIVE",
    storage_path: "screenshots/acme/before.png",
    width: 1440,
    height: 900,
  });
  vi.mocked(runCopyStrategist).mockResolvedValue(buildCopyOutput(options.t1Score));
  vi.mocked(runVisualDirector).mockResolvedValue(VISUAL_OUTPUT_EMPTY);
  vi.mocked(runSynthesizer).mockResolvedValue(buildSynthOutput());
  vi.mocked(runGbpExtraction).mockResolvedValue({
    review_count: null,
    rating: null,
    has_photo_reviews: null,
    description: null,
  });
  vi.mocked(findSimilarAudits).mockResolvedValue(null);
  vi.mocked(addAuditMemory).mockResolvedValue(true);
}

describe("runAnalyzePipeline — LIVE branch", () => {
  it("captures the submitted website and persists the real Before screenshot evidence", async () => {
    setupHappyPathMocks();
    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    expect(captureWebsiteScreenshot).toHaveBeenCalledWith({
      auditId: audit.id,
      url: LIVE_BUSINESS.presence.website,
    });
    expect(getAudit(audit.id)?.evidence_json).toMatchObject({
      before_screenshot: {
        ok: true,
        execution_mode: "LIVE",
        storage_path: "screenshots/acme/before.png",
        width: 1440,
        height: 900,
      },
    });
  });

  it("ISS-012: extracts real evidence from the Playwright-rendered DOM when the fetch ladder sees only a JS shell", async () => {
    setupHappyPathMocks();
    vi.mocked(fetchWebsiteEvidence).mockResolvedValue(null);
    vi.mocked(captureWebsiteScreenshot).mockResolvedValue({
      ok: true,
      execution_mode: "LIVE",
      storage_path: "screenshots/acme/before.png",
      width: 1440,
      height: 900,
      rendered_html: `<html><head><title>Acme SPA</title></head><body>
        <h1>Acme Handwerk Berlin</h1>
        <p>${"Wir sind Ihr zuverlässiger Partner für Reparaturen aller Art in Berlin. ".repeat(6)}</p>
        <a href="tel:+493012345678">030 1234 5678</a>
        <a href="/impressum">Impressum</a>
      </body></html>`,
    });
    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    const evidence = getAudit(audit.id)?.evidence_json as {
      website: { source: string; tel_links: string[]; has_impressum: boolean } | null;
      before_screenshot: Record<string, unknown>;
    };
    expect(evidence.website).not.toBeNull();
    expect(evidence.website?.source).toBe("fetched");
    expect(evidence.website?.tel_links).toContain("tel:+493012345678");
    expect(evidence.website?.has_impressum).toBe(true);
    // rendered_html is transient — it must never be persisted.
    expect(evidence.before_screenshot).not.toHaveProperty("rendered_html");
  });

  it("ISS-025: persists machine-extracted contact signals — a plain-text phone lands in evidence_json.website.contact_phones", async () => {
    setupHappyPathMocks();
    vi.mocked(fetchWebsiteEvidence).mockResolvedValue({
      evidence: {
        ...WEBSITE_EVIDENCE,
        tel_links: [],
        visible_text: [
          ...WEBSITE_EVIDENCE.visible_text,
          { section: "footer", text: "Telefon 030 12345678 — E-Mail: info@muster-sanitaer.example" },
        ],
      },
      imageSources: new Map(),
    });
    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    const evidence = getAudit(audit.id)?.evidence_json as {
      website: { tel_links: string[]; contact_phones?: string[]; contact_emails?: string[] } | null;
    };
    expect(evidence.website?.tel_links).toEqual([]);
    expect(evidence.website?.contact_phones).toContain("030 12345678");
    expect(evidence.website?.contact_emails).toContain("info@muster-sanitaer.example");
  });

  it("ISS-012: discloses an unreadable website in the report instead of scoring silence as absence", async () => {
    setupHappyPathMocks();
    vi.mocked(fetchWebsiteEvidence).mockResolvedValue(null);
    vi.mocked(captureWebsiteScreenshot).mockResolvedValue({
      ok: false,
      execution_mode: "HANDOFF_REQUIRED",
      reason: "timeout",
      detail: "Website screenshot capture timed out; provide a screenshot manually.",
    });
    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    const report = getAudit(audit.id)?.report_json as { disclaimers: string[] };
    expect(report.disclaimers.some((d) => d.includes("website could not be read"))).toBe(true);
  });

  it("persists the truthful screenshot handoff result without failing the audit", async () => {
    setupHappyPathMocks();
    vi.mocked(captureWebsiteScreenshot).mockResolvedValue({
      ok: false,
      execution_mode: "HANDOFF_REQUIRED",
      reason: "timeout",
      detail: "Website screenshot capture timed out; provide a screenshot manually.",
    });
    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await expect(runAnalyzePipeline(audit.id)).resolves.toBeUndefined();

    expect(getAudit(audit.id)?.status).toBe("scored");
    expect(getAudit(audit.id)?.evidence_json).toMatchObject({
      before_screenshot: {
        ok: false,
        execution_mode: "HANDOFF_REQUIRED",
        reason: "timeout",
      },
    });
  });

  it("runs every stage in the exact progress order and reaches status=scored", async () => {
    setupHappyPathMocks();
    const { createAudit, getAudit, listProgressEvents } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    expect(getAudit(audit.id)?.status).toBe("scored");
    expect(getAudit(audit.id)?.execution_mode).toBe("LIVE");
    expect(listProgressEvents(audit.id).map((e) => e.step)).toEqual([
      "reading_site",
      "collecting_images",
      "checking_local_search",
      "recalling_similar_audits",
      "experts_scoring",
      "building_channels",
      "done",
    ]);
  });

  it("assembles source-tagged text evidence from website, portal, pasted text, and the GBP description", async () => {
    setupHappyPathMocks();
    const { createAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    const call = vi.mocked(runCopyStrategist).mock.calls[0][0];
    expect(call.textEvidence).toContainEqual({
      source: "fetched",
      label: "website hero",
      text: WEBSITE_EVIDENCE.visible_text[0].text,
    });
    expect(call.textEvidence).toContainEqual({
      source: "fetched",
      label: "website about",
      text: WEBSITE_EVIDENCE.visible_text[1].text,
    });
    expect(call.textEvidence).toContainEqual({
      source: "fetched",
      label: "portal:yellow_pages",
      text: PORTAL_EVIDENCE.visible_text,
    });
    expect(call.textEvidence).toContainEqual({
      source: "manual",
      label: "pasted text",
      text: LIVE_BUSINESS.pasted_text,
    });
    expect(call.textEvidence).toContainEqual({
      source: "manual",
      label: "GBP description",
      text: "Family business since 1998.",
    });
  });

  it("prepends a machine-extracted 'site signals' item so the model can't contradict the pipeline's own detected phone/legal signals (ISS-004)", async () => {
    setupHappyPathMocks();
    const { createAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });

    await runAnalyzePipeline(audit.id);

    const call = vi.mocked(runCopyStrategist).mock.calls[0][0];
    expect(call.textEvidence[0]).toMatchObject({
      source: "fetched",
      label: "site signals (machine-extracted)",
    });
    // WEBSITE_EVIDENCE above has tel_links: ["tel:+493012345678"] and
    // has_impressum/has_datenschutz: true — the summary must reflect them,
    // not report an absence the pipeline itself already disproved.
    expect(call.textEvidence[0].text).toContain("+493012345678");
    expect(call.textEvidence[0].text).toContain("Impressum page: present");
    expect(call.textEvidence[0].text).toContain("Datenschutz page: present");
    expect(call.textEvidence[0].text.length).toBeLessThan(400);
  });

  it("merges Synthesizer one-liners into the persisted channel rows without touching rubric-only rows", async () => {
    setupHappyPathMocks({ t1Score: 1 }); // forces a hero_headline channel to exist
    vi.mocked(runSynthesizer).mockResolvedValue(
      buildSynthOutput({
        channel_one_liners: [{ channel_id: "hero_headline", one_liner: "SYNTH: fix your headline now." }],
      })
    );

    const { createAudit, listChannels } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });
    await runAnalyzePipeline(audit.id);

    const channels = listChannels(audit.id);
    expect(channels.find((c) => c.id === "hero_headline")?.one_liner).toBe("SYNTH: fix your headline now.");
    // Pinned row untouched by the Synthesizer output above — still the rubric default.
    expect(channels.find((c) => c.id === "optimized_site")?.one_liner).toBe(
      "See your business the way it could look."
    );
  });

  it("one portal failing is non-fatal — the audit still completes", async () => {
    setupHappyPathMocks({
      portalImpl: async (url) => {
        if (url.includes("check24")) throw new Error("portal fetch exploded");
        return PORTAL_EVIDENCE;
      },
    });

    const business: BusinessInput = {
      ...LIVE_BUSINESS,
      presence: { ...LIVE_BUSINESS.presence, other: ["https://check24.example/acme"] },
    };

    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: business, execution_mode: "LIVE" });

    await expect(runAnalyzePipeline(audit.id)).resolves.toBeUndefined();
    expect(getAudit(audit.id)?.status).toBe("scored");
  });

  it("a findability error attaches an ASSUMPTION disclaimer to the report", async () => {
    setupHappyPathMocks();
    vi.mocked(checkFindability).mockResolvedValue({ status: "error", results: [], source: "tavily" });

    const { createAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });
    await runAnalyzePipeline(audit.id);

    const report = getAudit(audit.id)?.report_json as { disclaimers: string[] };
    expect(report.disclaimers.some((d) => d.startsWith("ASSUMPTION"))).toBe(true);
  });

  it("a Stage 2/4 model failure propagates as a rejection — the caller marks status=failed, not this module", async () => {
    setupHappyPathMocks();
    vi.mocked(runSynthesizer).mockRejectedValue(new Error("synthesizer boom"));

    const { createAudit, updateAudit, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: LIVE_BUSINESS, execution_mode: "LIVE" });
    updateAudit(audit.id, { status: "analyzing" });

    await expect(runAnalyzePipeline(audit.id)).rejects.toThrow("synthesizer boom");
    expect(getAudit(audit.id)?.status).toBe("analyzing"); // unchanged — orchestrator never self-fails
  });

  it("normalizes a raw uploaded_image row into a new normalized asset and marks the original consumed", async () => {
    setupHappyPathMocks();
    const business: BusinessInput = {
      brand_name: "No Website Co",
      trade: "handyman",
      presence: {},
      pasted_text: "Reliable handyman services, same-day callouts.",
    };

    const { createAudit, insertAsset, listAssets } = await import("../lib/db");
    const audit = createAudit({ business_json: business, execution_mode: "LIVE" });

    const uploadDir = join(storageDir, "uploads", audit.id);
    mkdirSync(uploadDir, { recursive: true });
    const filename = "raw-upload.jpg";
    writeFileSync(join(uploadDir, filename), TEST_PNG_BYTES);

    // Mirrors the real assets route's convention (app/api/audits/[id]/assets/route.ts):
    // storage_path is stored as a literal "storage/uploads/<id>/<filename>" string, not
    // resolved against APP_STORAGE_DIR.
    const rawAsset = insertAsset({
      audit_id: audit.id,
      kind: "uploaded_image",
      storage_path: join("storage", "uploads", audit.id, filename),
      meta_json: { filename, mime: "image/png", bytes: TEST_PNG_BYTES.length },
      status: "uploaded",
    });

    await runAnalyzePipeline(audit.id);

    const assets = listAssets(audit.id);
    const original = assets.find((a) => a.id === rawAsset.id);
    expect(original?.status).toBe("consumed");

    const normalized = assets.find((a) => a.kind === "uploaded_image" && a.status === "normalized");
    expect(normalized).toBeDefined();
    expect(normalized?.id).not.toBe(rawAsset.id);
    // ISS-001: normalized assets store storage-root-RELATIVE paths (so the
    // /assets/ route and assetUrl can serve them) — resolve before existsSync.
    expect(normalized?.storage_path).toBeTruthy();
    expect(normalized!.storage_path!.startsWith("/")).toBe(false);
    expect(existsSync(join(storageDir, normalized!.storage_path as string))).toBe(true);
  });

  it("a raw gbp_screenshot upload feeds GBP extraction and never enters the scored image set", async () => {
    setupHappyPathMocks();
    vi.mocked(runGbpExtraction).mockResolvedValue({
      review_count: 22,
      rating: 4.1,
      has_photo_reviews: true,
      description: null,
    });

    const business: BusinessInput = {
      brand_name: "Screenshot Co",
      trade: "electrician",
      presence: { maps: "https://maps.example/screenshot-co" },
      pasted_text: "We wire it right the first time.",
    };

    const { createAudit, insertAsset, listAssets, getAudit } = await import("../lib/db");
    const audit = createAudit({ business_json: business, execution_mode: "LIVE" });

    const uploadDir = join(storageDir, "uploads", audit.id);
    mkdirSync(uploadDir, { recursive: true });
    const filename = "gbp-screenshot.jpg";
    writeFileSync(join(uploadDir, filename), TEST_PNG_BYTES);

    const rawAsset = insertAsset({
      audit_id: audit.id,
      kind: "gbp_screenshot",
      storage_path: join("storage", "uploads", audit.id, filename),
      meta_json: { filename, mime: "image/png", bytes: TEST_PNG_BYTES.length },
      status: "uploaded",
    });

    await runAnalyzePipeline(audit.id);

    expect(runGbpExtraction).toHaveBeenCalledTimes(1);
    const [{ screenshots }] = vi.mocked(runGbpExtraction).mock.calls[0];
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]).toMatch(/^data:image\/jpeg;base64,/);

    const assets = listAssets(audit.id);
    expect(assets.find((a) => a.id === rawAsset.id)?.status).toBe("consumed");
    // No new uploaded_image row was created from the screenshot — it never
    // enters the image set Visual Director / rubric.ts score.
    expect(assets.filter((a) => a.kind === "uploaded_image")).toHaveLength(0);
    expect(assets.filter((a) => a.kind === "gbp_screenshot")).toHaveLength(1);

    const report = getAudit(audit.id)?.report_json as { reputation_chips: unknown };
    expect(report.reputation_chips).toEqual({ review_count: 22, rating: 4.1, has_photo_reviews: true });
  });
});
