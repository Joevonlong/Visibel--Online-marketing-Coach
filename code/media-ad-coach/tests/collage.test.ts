// ISS-039 regression guard — every generated image must be ONE photographic
// scene. The reported defect: a "storefront" image came back as a collage of
// three scenes (two people with a van / a boiler room / a bathroom) stitched
// into one frame. Two defences are pinned here:
//   1. the PROMPT carries an explicit single-scene rule, and no longer contains
//      the wordings that invited a collage (a list of alternatives, a bare
//      enumeration of services, "the other images in this set");
//   2. the generated frame is VERIFIED, with exactly one regeneration on a
//      collage — and the verification fails OPEN, so it can never lose an image
//      or fail a run on its own.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAI } from "openai";

import { SINGLE_SCENE_RULE, buildHeroEditPrompt, buildImageGenPrompt, type ImageGenVariant } from "../lib/agents/prompts";
import { COLLAGE_CORRECTION, detectCollage } from "../lib/images/collage";
import { generateChannelImage } from "../lib/improve/image";
import type { Trade } from "../lib/schemas";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TRADES: Trade[] = ["plumber", "electrician", "roofing", "handyman", "doctor", "other"];
const VARIANTS: ImageGenVariant[] = ["hero", "team", "work_proof", "storefront", "craft_detail", "equipment"];

const PLUMBER = {
  brand_name: "Muster + Sohn",
  city: "Berlin",
  background: "Badsanierung, Heizungsinstallation, Rohrreinigung",
  services: ["Badsanierung", "Heizungsinstallation", "Rohrreinigung"],
};

// The collage vocabulary the rule must cover — image models treat each of these
// as a separate concept, so naming only "collage" is not enough.
const COLLAGE_SHAPES = ["collage", "grid", "split-frame", "multi-panel", "diptych", "triptych", "montage", "before/after"];

describe("ISS-039 — the single-scene rule is on every generation prompt", () => {
  it("carries the hard constraint for every trade × variant, with and without business context", () => {
    for (const trade of TRADES) {
      for (const variant of VARIANTS) {
        for (const business of [undefined, PLUMBER]) {
          const prompt = buildImageGenPrompt(trade, variant, business);
          expect(prompt, `${trade}/${variant} lost the single-scene rule`).toContain(SINGLE_SCENE_RULE);
        }
      }
    }
  });

  it("names every collage shape, not just the word 'collage'", () => {
    for (const shape of COLLAGE_SHAPES) {
      expect(SINGLE_SCENE_RULE.toLowerCase()).toContain(shape);
    }
    expect(SINGLE_SCENE_RULE.toLowerCase()).toContain("one single photographic scene only");
  });

  it("keeps the rule on a subject-anchored gallery filler (the slot that produced the defect)", () => {
    const prompt = buildImageGenPrompt("plumber", "storefront", PLUMBER, "the branded service van outside a job");
    expect(prompt).toContain(SINGLE_SCENE_RULE);
    expect(prompt).toContain("one room, one moment, one camera position");
  });

  it("keeps the rule on the hero EDIT prompt — an edit must return one photograph too", () => {
    expect(buildHeroEditPrompt("plumber", PLUMBER)).toContain(SINGLE_SCENE_RULE);
  });
});

describe("ISS-039 — the collage-inducing wordings are gone", () => {
  it("THE BUG: no prompt talks about the other images in the set", () => {
    // "must be visually DISTINCT from the other images in this set" told the
    // model there IS a set — and it rendered one.
    for (const variant of VARIANTS) {
      const prompt = buildImageGenPrompt("plumber", variant, PLUMBER, "Badsanierung");
      expect(prompt.toLowerCase()).not.toContain("in this set");
      expect(prompt.toLowerCase()).not.toContain("other images");
    }
  });

  it("THE BUG: the storefront direction picks ONE location instead of listing three", () => {
    const prompt = buildImageGenPrompt("plumber", "storefront", PLUMBER);
    expect(prompt).not.toContain("entrance, workshop or branded vehicle");
    expect(prompt).toContain("exactly one location");
    expect(prompt).toContain("never both");
  });

  it("THE BUG: the service list is framed as context, never as things to depict together", () => {
    const prompt = buildImageGenPrompt("plumber", "hero", PLUMBER);
    expect(prompt).not.toContain("This business actually offers:");
    expect(prompt).toContain("Background context only, not things to depict together");
    expect(prompt).toContain("do not show several services in the same frame");
    // Grounding itself must survive the rewording.
    expect(prompt).toContain("Rohrreinigung");
  });
});

// ---------------------------------------------------------------------------
// detectCollage — cheap verification that can never cost an image
// ---------------------------------------------------------------------------

function visionClient(verdict: unknown) {
  const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }));
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

describe("ISS-039 — detectCollage", () => {
  afterEach(() => {
    delete process.env.IMAGE_COLLAGE_CHECK;
  });

  it("reports the model's verdict", async () => {
    const { client, create } = visionClient({ is_collage: true, reason: "Three unrelated scenes in one frame." });
    await expect(detectCollage(TINY_PNG_BASE64, { client })).resolves.toEqual({
      is_collage: true,
      reason: "Three unrelated scenes in one frame.",
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("fails OPEN on a broken call — verification must never lose an image we paid for", async () => {
    const create = vi.fn(async () => {
      throw new Error("vision down");
    });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    await expect(detectCollage(TINY_PNG_BASE64, { client })).resolves.toEqual({ is_collage: false, reason: "" });
  });

  it("fails OPEN on a malformed verdict, and is skipped entirely by the kill switch", async () => {
    const { client } = visionClient({ nonsense: true });
    await expect(detectCollage(TINY_PNG_BASE64, { client })).resolves.toMatchObject({ is_collage: false });

    process.env.IMAGE_COLLAGE_CHECK = "0";
    const off = visionClient({ is_collage: true, reason: "x" });
    await expect(detectCollage(TINY_PNG_BASE64, { client: off.client })).resolves.toMatchObject({ is_collage: false });
    expect(off.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateChannelImage — exactly ONE regeneration on a detected collage
// ---------------------------------------------------------------------------

describe("ISS-039 — a detected collage is regenerated exactly once", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "visibel-collage-test-"));
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

  /** A fake client whose vision verdicts are scripted per call. */
  function client(verdicts: Array<{ is_collage: boolean; reason: string }>) {
    const generate = vi.fn(async () => ({ data: [{ b64_json: TINY_PNG_BASE64 }] }));
    let i = 0;
    const create = vi.fn(async () => ({
      choices: [{ message: { content: JSON.stringify(verdicts[i++] ?? { is_collage: false, reason: "" }) } }],
    }));
    return {
      generate,
      create,
      client: { images: { generate }, chat: { completions: { create } } } as unknown as OpenAI,
    };
  }

  async function audit() {
    const db = await import("../lib/db");
    return db.createAudit({
      business_json: { brand_name: "Muster + Sohn", trade: "plumber", city: "Berlin" },
      execution_mode: "LIVE",
    });
  }

  it("THE FIX: a collage triggers one retry on the same prompt plus a correction, and is recorded", async () => {
    const row = await audit();
    const fake = client([
      { is_collage: true, reason: "Three panels: a van, a boiler room and a bathroom." },
      { is_collage: false, reason: "One bathroom, one camera position." },
    ]);

    const result = await generateChannelImage({
      auditId: row.id,
      channelId: "work_proof_images",
      trade: "plumber",
      client: fake.client,
    });

    expect(result.generation_error).toBeNull();
    expect(fake.generate).toHaveBeenCalledTimes(2);
    const prompts = fake.generate.mock.calls.map((c) => (c as unknown as [{ prompt: string }])[0].prompt);
    const [first, second] = prompts;
    expect(second).toContain(first!); // same brief …
    expect(second).toContain(COLLAGE_CORRECTION); // … plus the correction
    expect(result.asset?.meta_json).toMatchObject({
      collage_detected: "Three panels: a van, a boiler room and a bathroom.",
      collage_retry: "recovered",
    });
  });

  it("a clean frame costs exactly one generation and carries no collage note", async () => {
    const row = await audit();
    const fake = client([{ is_collage: false, reason: "One kitchen." }]);

    const result = await generateChannelImage({
      auditId: row.id,
      channelId: "work_proof_images",
      trade: "plumber",
      client: fake.client,
    });

    expect(fake.generate).toHaveBeenCalledTimes(1);
    expect(result.asset?.meta_json).not.toHaveProperty("collage_detected");
  });

  it("never regenerates more than once — a stubborn model costs one extra image, not N", async () => {
    const row = await audit();
    const fake = client([
      { is_collage: true, reason: "Grid of four." },
      { is_collage: true, reason: "Still a grid." },
    ]);

    const result = await generateChannelImage({
      auditId: row.id,
      channelId: "work_proof_images",
      trade: "plumber",
      client: fake.client,
    });

    expect(fake.generate).toHaveBeenCalledTimes(2);
    expect(result.asset).not.toBeNull(); // honest: we keep the image and say so
    expect(result.asset?.meta_json).toMatchObject({ collage_retry: "still_collage" });
  });
});
