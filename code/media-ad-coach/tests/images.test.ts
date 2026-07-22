// ISS-014 regression guard for lib/pipeline/images.ts#harvestImages: a
// favicon/logo-scale asset is dropped by its TRUE downloaded dimensions (even
// when it declared no size and its filename carries no logo/icon hint — exactly
// the live pilot site's two logos), and every stored real photo records the page URL
// it was found on in meta_json.source_page. Deterministic: global fetch is
// stubbed with real sharp-generated JPEG buffers, storage + DB point at a temp
// dir (repo convention: APP_DB_PATH / APP_STORAGE_DIR).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { ImgCandidate } from "../lib/schemas";
import { harvestImages } from "../lib/pipeline/images";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "visibel-images-test-"));
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
  vi.unstubAllGlobals();
  rmSync(tmpDir, { recursive: true, force: true });
});

/** A solid-colour JPEG of the given pixel size — a stand-in real download. */
async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 120, b: 140 } },
  })
    .jpeg()
    .toBuffer();
}

/** Stubs global fetch so each URL resolves to the matching sharp buffer. */
function stubFetch(bytesByUrl: Map<string, Buffer>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = typeof input === "string" ? input : String(input);
      const buffer = bytesByUrl.get(url);
      if (!buffer) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(buffer), { status: 200 });
    })
  );
}

describe("harvestImages (ISS-014)", () => {
  it("drops a logo-scale download and keeps the real photo, recording each source page", async () => {
    const dbModule = await import("../lib/db");
    const auditId = dbModule.createAudit({
      business_json: { brand_name: "MUSTER + SOHN GmbH", trade: "plumber", city: "Berlin", presence: {} },
      execution_mode: "LIVE",
      status: "processing",
    }).id;

    const logoUrl = "https://www.muster-sanitaer.example/resources/BuF.jpg"; // no "logo"/"icon" hint, no declared size
    const galleryUrl = "https://www.muster-sanitaer.example/resources/A1.jpg";
    stubFetch(
      new Map([
        [logoUrl, await jpeg(50, 50)], // favicon-scale -> must be gated post-download
        [galleryUrl, await jpeg(400, 300)], // a real photo -> kept
      ])
    );

    const candidates: ImgCandidate[] = [
      { src: logoUrl, alt: null },
      { src: galleryUrl, alt: "Bad" },
    ];
    const sources = new Map([
      [logoUrl, "https://www.muster-sanitaer.example/"],
      [galleryUrl, "https://www.muster-sanitaer.example/bildergalerie.html"],
    ]);

    const result = await harvestImages(auditId, candidates, "https://www.muster-sanitaer.example/", sources);

    // Only the real photo survives as an "Original" harvested image.
    expect(result.assets).toHaveLength(1);
    expect(result.skipped_count).toBe(1);

    const asset = result.assets[0];
    const meta = asset.meta_json as { source_page?: string; width?: number; src?: string };
    expect(meta.src).toBe(galleryUrl);
    expect(meta.width).toBe(400);
    // ISS-014: the page the <img> was found on, not just the asset URL.
    expect(meta.source_page).toBe("https://www.muster-sanitaer.example/bildergalerie.html");

    // The logo was never stored, so it can never surface as an "Original" photo.
    const stored = dbModule.listAssets(auditId).filter((a) => a.kind === "harvested_image");
    expect(stored).toHaveLength(1);
    expect((stored[0].meta_json as { src?: string }).src).toBe(galleryUrl);
  });

  it("falls back to baseUrl for source_page when an image is absent from the provenance map", async () => {
    const dbModule = await import("../lib/db");
    const auditId = dbModule.createAudit({
      business_json: { brand_name: "Acme", trade: "plumber", presence: {} },
      execution_mode: "LIVE",
      status: "processing",
    }).id;

    const photoUrl = "https://acme.test/photo.jpg";
    stubFetch(new Map([[photoUrl, await jpeg(500, 400)]]));

    const result = await harvestImages(
      auditId,
      [{ src: photoUrl, alt: null }],
      "https://acme.test/",
      new Map()
    );

    expect(result.assets).toHaveLength(1);
    expect((result.assets[0].meta_json as { source_page?: string }).source_page).toBe("https://acme.test/");
  });
});
