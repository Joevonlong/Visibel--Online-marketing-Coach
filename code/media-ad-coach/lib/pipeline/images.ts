// Image harvest, normalization, and vision-prep (plan §3.2, F-026/F-029).
// Downloads + normalizes are never allowed to throw the pipeline over —
// a download or normalize failure is an honest skip, never a fabricated
// asset. Zero usable images is itself the top image finding (F-029),
// handled downstream in lib/rubric.ts from an empty `assets` array here.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import sharp from "sharp";
import { insertAsset, listAssets, type AssetRecord } from "../db";
import type { ImgCandidate } from "../schemas";

const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024; // 8 MB cap per image
const MAX_HARVESTED = 8; // plan §3.2: keep the 8 largest content images
const NORMALIZED_LONG_EDGE = 1024;
const JPEG_QUALITY = 80;

// ---------------------------------------------------------------------------
// Candidate filtering (pure — exported for tests)
// ---------------------------------------------------------------------------

const ICON_PATH_HINTS = /(logo|icon|sprite|favicon|badge)/i;
// ISS-014: the short-edge floor below which an image is treated as
// favicon/logo/icon-scale and never presented as one of the business's real
// "Original" photos. Lowered from the old 200px content floor: real small
// businesses routinely host genuinely small (e.g. 120px gallery thumbnail)
// project photos that ARE real work — dropping everything under 200 both hid
// those real photos and (because the live pilot site's two logos declared no
// dimensions at all) let favicon-scale logos through as "originals". 100px
// keeps a 120px gallery thumbnail while still excluding a 50x50 / 170x19 logo.
const LOGO_SCALE_SHORT_EDGE = 100;
// ISS-014: a wordmark/banner (e.g. the 170x19 "EXAMPLE-SUPPLIER" strip) can
// clear the short-edge floor yet still be a logo — an extreme aspect ratio on
// a smallish image is the tell. Only gates images whose short edge is also
// modest, so a genuine wide work photo is never dropped.
const LOGO_MAX_ASPECT = 4;
const LOGO_ASPECT_SHORT_EDGE_MAX = 300;

/** True when an image's real (downloaded) dimensions read as favicon/logo/
 *  icon-scale rather than a real photo (ISS-014). Short edge below the floor,
 *  or an extreme aspect ratio on a still-modest image (a wordmark strip).
 *  Unknown dimensions (null) are NOT gated here — the caller decides. Pure and
 *  exported so the gate is directly testable without a network download. */
export function isLogoScaleImage(width: number | null, height: number | null): boolean {
  if (width === null || height === null) return false;
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  if (shortEdge < LOGO_SCALE_SHORT_EDGE) return true;
  if (longEdge / Math.max(shortEdge, 1) >= LOGO_MAX_ASPECT && shortEdge < LOGO_ASPECT_SHORT_EDGE_MAX) {
    return true;
  }
  return false;
}

/** Filters out icons/logos/sprites, declared favicon-scale images, data URIs,
 *  and duplicate URLs (after normalizing away query string/hash). Pure and
 *  network-free so the survivor set is directly testable (F-026). The declared-
 *  dimension gate here (ISS-014) only drops images that DECLARE a sub-100px
 *  short edge; images with no declared size or a real-photo size survive and
 *  are re-checked against their true dimensions post-download in
 *  {@link harvestImages}. */
export function filterImageCandidates(candidates: ImgCandidate[], baseUrl: string): ImgCandidate[] {
  const seen = new Set<string>();
  const survivors: ImgCandidate[] = [];

  for (const candidate of candidates) {
    const src = candidate.src;
    if (!src) continue;
    if (src.startsWith("data:")) continue;
    if (/\.svg(\?|#|$)/i.test(src)) continue;
    if (ICON_PATH_HINTS.test(src) || (candidate.alt && ICON_PATH_HINTS.test(candidate.alt))) continue;
    if (candidate.natural_size) {
      const { width, height } = candidate.natural_size;
      if (Math.min(width, height) < LOGO_SCALE_SHORT_EDGE) continue;
    }

    let normalizedSrc: string;
    try {
      const u = new URL(src, baseUrl);
      u.search = "";
      u.hash = "";
      normalizedSrc = u.toString();
    } catch {
      normalizedSrc = src;
    }
    if (seen.has(normalizedSrc)) continue;
    seen.add(normalizedSrc);

    survivors.push({ ...candidate, src: normalizedSrc });
  }

  return survivors;
}

// ---------------------------------------------------------------------------
// Download + normalize
// ---------------------------------------------------------------------------

async function tryDownload(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { "User-Agent": REALISTIC_USER_AGENT },
    });
    if (!res.ok) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_DOWNLOAD_BYTES) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function normalizeToJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // respect EXIF orientation before resizing
    .resize({
      width: NORMALIZED_LONG_EDGE,
      height: NORMALIZED_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/** Storage root, overridable via APP_STORAGE_DIR (same convention as
 *  lib/db.ts's APP_DB_PATH) so tests can point everything at a temp dir. */
function resolveStorageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return join(process.cwd(), "storage");
}

function ensureAuditImageDir(auditId: string): string {
  const dir = join(resolveStorageRoot(), "images", auditId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** `assets.storage_path` is stored RELATIVE to the storage root (same
 *  convention as lib/pipeline/screenshot.ts and lib/improve/image.ts) so the
 *  /assets/[...path] route and lib/client/assets.ts#assetUrl can serve it.
 *  Legacy rows written before this convention hold absolute paths — resolve
 *  both when reading from disk. */
function resolveAssetFilePath(storagePath: string): string {
  return isAbsolute(storagePath) ? storagePath : join(resolveStorageRoot(), storagePath);
}

// ---------------------------------------------------------------------------
// Public pipeline steps
// ---------------------------------------------------------------------------

export interface HarvestResult {
  assets: AssetRecord[];
  skipped_count: number;
}

/** Same query/hash-stripping normalization {@link filterImageCandidates}
 *  applies to survivor srcs, so a source-page map keyed the same way (built in
 *  lib/pipeline/website.ts) resolves against the survivor's already-normalized
 *  `src` (ISS-014 per-image provenance). */
function normalizeSrcForLookup(src: string): string {
  try {
    const u = new URL(src);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return src;
  }
}

/** Filters `candidates`, downloads survivors (size-capped, 10 s timeout),
 *  keeps the 8 largest by downloaded byte size, normalizes each with sharp
 *  (1024px long edge, JPEG q80), writes to storage/images/<auditId>/, and
 *  inserts an `assets` row per image. Zero usable images (F-029) returns an
 *  empty `assets` array — never fabricated, the absence is reported honestly
 *  via `skipped_count`.
 *
 *  ISS-014: a survivor whose TRUE (downloaded) dimensions read as favicon/
 *  logo-scale ({@link isLogoScaleImage}) is dropped here rather than stored —
 *  the declared-dimension pre-filter can't catch a logo that declares no size
 *  (the live pilot site's two logos did exactly that). Each stored asset records
 *  the page URL it was found on via `sourcePageBySrc` (keyed by normalized
 *  src) in `meta_json.source_page`, falling back to `baseUrl`. */
export async function harvestImages(
  auditId: string,
  candidates: ImgCandidate[],
  baseUrl: string,
  sourcePageBySrc?: ReadonlyMap<string, string>
): Promise<HarvestResult> {
  const survivors = filterImageCandidates(candidates, baseUrl);
  let skippedCount = candidates.length - survivors.length;

  const downloaded: { candidate: ImgCandidate; buffer: Buffer }[] = [];
  for (const candidate of survivors) {
    const buffer = await tryDownload(candidate.src);
    if (buffer) {
      downloaded.push({ candidate, buffer });
    } else {
      skippedCount++;
    }
  }

  downloaded.sort((a, b) => b.buffer.byteLength - a.buffer.byteLength);
  const kept = downloaded.slice(0, MAX_HARVESTED);
  skippedCount += downloaded.length - kept.length;

  const assets: AssetRecord[] = [];
  if (kept.length > 0) {
    const dir = ensureAuditImageDir(auditId);
    let index = 1;
    for (const { candidate, buffer } of kept) {
      try {
        const normalized = await normalizeToJpeg(buffer);
        const metadata = await sharp(normalized).metadata();
        const width = metadata.width ?? null;
        const height = metadata.height ?? null;

        // ISS-014: a logo/favicon-scale asset is never a real "Original" photo.
        if (isLogoScaleImage(width, height)) {
          skippedCount++;
          continue;
        }

        const relativePath = join("images", auditId, `img-${index}.jpg`);
        writeFileSync(join(dir, `img-${index}.jpg`), normalized);

        const sourcePage = sourcePageBySrc?.get(normalizeSrcForLookup(candidate.src)) ?? baseUrl;

        assets.push(
          insertAsset({
            audit_id: auditId,
            kind: "harvested_image",
            source: candidate.src,
            storage_path: relativePath,
            meta_json: {
              src: candidate.src,
              source_page: sourcePage,
              alt: candidate.alt,
              bytes: normalized.byteLength,
              width,
              height,
            },
            status: "normalized",
          })
        );
        index++;
      } catch {
        // Corrupt/unsupported image data — an honest skip, not a crash.
        skippedCount++;
      }
    }
  }

  return { assets, skipped_count: skippedCount };
}

/** Normalizes an uploaded image the same way as a harvested one (kind
 *  `uploaded_image`). Used by the assets API route (owned by another agent)
 *  to ingest manual uploads (F-027/F-041). */
export async function ingestUploadedImage(
  auditId: string,
  buffer: Buffer,
  filename: string
): Promise<AssetRecord> {
  const dir = ensureAuditImageDir(auditId);
  const normalized = await normalizeToJpeg(buffer);
  const metadata = await sharp(normalized).metadata();
  const uploadName = `upload-${randomUUID()}.jpg`;
  writeFileSync(join(dir, uploadName), normalized);

  return insertAsset({
    audit_id: auditId,
    kind: "uploaded_image",
    source: filename,
    storage_path: join("images", auditId, uploadName),
    meta_json: {
      original_filename: filename,
      bytes: normalized.byteLength,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    },
    status: "normalized",
  });
}

export interface VisionImageInput {
  asset_id: string;
  storage_path: string;
  base64_data_url: string;
}

/** Loads up to 8 normalized harvested images plus all normalized uploaded
 *  images from disk and returns them as base64 data URLs, the shape the
 *  Visual Director (GPT-4o vision, F-033) consumes as input. A missing or
 *  unreadable file is skipped honestly rather than fabricated. */
export async function prepareImagesForVision(auditId: string): Promise<VisionImageInput[]> {
  const all = listAssets(auditId);
  const harvested = all
    .filter((a) => a.kind === "harvested_image" && a.status === "normalized" && a.storage_path)
    .slice(0, MAX_HARVESTED);
  const uploaded = all.filter(
    (a) => a.kind === "uploaded_image" && a.status === "normalized" && a.storage_path
  );

  const results: VisionImageInput[] = [];
  for (const asset of [...harvested, ...uploaded]) {
    try {
      const buffer = readFileSync(resolveAssetFilePath(asset.storage_path as string));
      results.push({
        asset_id: asset.id,
        storage_path: asset.storage_path as string,
        base64_data_url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      });
    } catch {
      // File missing/unreadable on disk — skip, don't fabricate the input.
    }
  }
  return results;
}
