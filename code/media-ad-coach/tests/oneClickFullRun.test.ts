// ISS-040 regression guard — the one-click "Do It All For You" button (FEA-111)
// must produce a FULL page rebuild, gallery fillers (FEA-117) included.
//
// THE BUG: the button does not post the literal `"all"`. It posts an explicit
// ARRAY of every todo channel (`selectImprovableIds`), `optimized_site`
// included. The orchestrator decided "is this a full run?" from
// `selection === "all"`, so the real user path rebuilt the whole After page
// with fillers switched off and the gallery stuck at one tile — while a
// developer calling the API with `"all"` saw four. These tests drive the exact
// request the UI builds, from the UI's own selector, so the two paths can never
// silently diverge again.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAI } from "openai";

import { selectImprovableIds } from "../components/report/improveAllState";
import { runImprove } from "../lib/improve/orchestrate";
import type { Channel } from "../lib/schemas";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-oneclick-test-"));
  process.env.APP_DB_PATH = join(tmpDir, "app.db");
  process.env.APP_STORAGE_DIR = join(tmpDir, "storage");
  (await import("../lib/db")).closeDb();
});

afterEach(async () => {
  (await import("../lib/db")).closeDb();
  delete process.env.APP_DB_PATH;
  delete process.env.APP_STORAGE_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

/** The channel set a scored audit carries into the report page. */
const CHANNEL_SEED = [
  { id: "hero_headline", lane: "text", title: "Headline", one_liner: "x", priority: 12, severity: "high", status: "todo", findings_json: [], before_json: { excerpts: ["Sanitär Krause"] }, after_json: null },
  { id: "hero_image", lane: "image", title: "Hero image", one_liner: "x", priority: 11, severity: "high", status: "todo", findings_json: [], before_json: { asset_refs: [], notes: [] }, after_json: null },
  { id: "team_image", lane: "image", title: "Team photo", one_liner: "x", priority: 9, severity: "medium", status: "todo", findings_json: [], before_json: { asset_refs: [], notes: [] }, after_json: null },
  { id: "work_proof_images", lane: "image", title: "Work proof", one_liner: "x", priority: 8, severity: "medium", status: "todo", findings_json: [], before_json: { asset_refs: [], notes: [] }, after_json: null },
  { id: "optimized_site", lane: "site", title: "Optimized page", one_liner: "x", priority: 30, severity: "high", status: "todo", findings_json: [], before_json: null, after_json: null },
  { id: "promo_video", lane: "video", title: "Promo video", one_liner: "x", priority: 1, severity: "low", status: "coming_soon", findings_json: [], before_json: null, after_json: null },
];

async function seedAudit() {
  const db = await import("../lib/db");
  const audit = db.createAudit({
    business_json: { brand_name: "Sanitär Krause Berlin", trade: "plumber", city: "Berlin", background: "Bad- und Heizungsinstallation" },
    execution_mode: "LIVE",
  });
  db.replaceChannels(audit.id, CHANNEL_SEED as never);
  return audit;
}

function fakeClient() {
  const generate = vi.fn(async () => ({ data: [{ b64_json: TINY_PNG_BASE64 }] }));
  const create = vi.fn(async (...args: unknown[]) => {
    const name = (args[0] as { response_format: { json_schema: { name: string } } }).response_format.json_schema.name;
    const body =
      name === "collage_verdict"
        ? { is_collage: false, reason: "One scene." }
        : {
            channel_id: "hero_headline",
            before_excerpt: "Sanitär Krause",
            after: { h1: "Bad & Heizung vom Meisterbetrieb in Berlin", subline: "Schnelle Hilfe", cta_text: "Jetzt anrufen" },
            rationale_one_liner: "Names the trade and area.",
          };
    return { choices: [{ message: { content: JSON.stringify(body) } }] };
  });
  return {
    generate,
    client: { chat: { completions: { create } }, images: { generate, edit: generate } } as unknown as OpenAI,
  };
}

async function galleryPlanEvents(auditId: string): Promise<string[]> {
  const db = await import("../lib/db");
  return db
    .listProgressEvents(auditId)
    .map((e) => String(e.detail ?? ""))
    .filter((d) => d.startsWith("gallery plan:") || d.includes("gallery_filler"));
}

describe("ISS-040 — the one-click button is a full page run", () => {
  it("THE BUG: the button posts an array (not 'all') that contains optimized_site", () => {
    // Pinned straight from the UI's own selector: this is the request shape the
    // orchestrator must recognize as a full page rebuild.
    const channels = CHANNEL_SEED.map((c) => ({ id: c.id, status: c.status })) as unknown as Channel[];
    const posted = selectImprovableIds(channels);
    expect(posted).not.toBe("all");
    expect(posted).toContain("optimized_site");
    expect(posted).not.toContain("promo_video");
  });

  it("THE FIX: that exact array fills the gallery to its minimum", async () => {
    const audit = await seedAudit();
    const channels = CHANNEL_SEED.map((c) => ({ id: c.id, status: c.status })) as unknown as Channel[];
    const posted = selectImprovableIds(channels);
    const fake = fakeClient();

    await runImprove(audit.id, posted, { client: fake.client });

    const events = await galleryPlanEvents(audit.id);
    expect(events.some((d) => d.startsWith("gallery plan:"))).toBe(true);

    // Real filler images were planned AND generated, each with its own slot.
    // (The final tile COUNT is asserted end-to-end against a live run — this
    // fake returns the same 1×1 PNG for every call, so fingerprint dedup
    // legitimately collapses them into one tile here.)
    const db = await import("../lib/db");
    const fillers = db
      .listAssets(audit.id)
      .filter((a) => (a.meta_json as { gallery_filler?: unknown } | null)?.gallery_filler === true);
    expect(fillers.length).toBeGreaterThanOrEqual(3);
    expect(db.getAudit(audit.id)?.preview_json).toBeTruthy(); // the page was rebuilt too
  });

  it("a single-channel 'Improve It' still does NOT fill the gallery (the cost constraint)", async () => {
    const audit = await seedAudit();
    const fake = fakeClient();

    // Exactly what a channel row posts: one id, no optimized_site.
    await runImprove(audit.id, ["work_proof_images"], { client: fake.client });

    expect(await galleryPlanEvents(audit.id)).toEqual([]);
    expect(fake.generate).toHaveBeenCalledTimes(1);
  });

  it("the literal 'all' keeps working — the API path is unchanged", async () => {
    const audit = await seedAudit();
    const fake = fakeClient();

    await runImprove(audit.id, "all", { client: fake.client });

    expect((await galleryPlanEvents(audit.id)).some((d) => d.startsWith("gallery plan:"))).toBe(true);
  });
});
