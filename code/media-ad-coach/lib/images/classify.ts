/**
 * ISS-034 — input preparation for the FEA-114 image classifier.
 *
 * FEA-114 originally piggybacked on `prepareImagesForVision`, which exists to
 * feed the Visual Director's SCORING pass: it takes at most 8 harvested images
 * and only rows in status `normalized`. That is right for scoring and wrong
 * for classification — every real image the composition layer can later choose
 * from must have a category, including the ones that pass never sees.
 *
 * In the reported defect exactly that gap fired: an uploaded photo of three
 * parked vans sat in status `consumed` (the raw upload row, kept alongside its
 * normalized copy), was never classified, fell back to `other` at 0.2
 * confidence — and was then picked as the hero's edit source and enhanced
 * twice. Classification now covers every real asset with a readable file.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { listAssets, type AssetRecord } from "../db";

export interface ClassifiableImage {
  asset_id: string;
  data_url: string;
  alt?: string;
}

/** Kept in step with lib/pipeline/images.ts's resolution rule (ISS-001:
 *  storage paths are relative to APP_STORAGE_DIR unless already absolute). */
function resolveAssetFilePath(storagePath: string): string {
  const root = process.env.APP_STORAGE_DIR?.trim() ? process.env.APP_STORAGE_DIR : join(process.cwd(), "storage");
  return isAbsolute(storagePath) ? storagePath : join(root, storagePath);
}

/** A generous cap: classification is one cheap vision call per batch of 8, and
 *  the composition layer can only pick from what it knows about. */
const MAX_CLASSIFIED_IMAGES = 16;

function altOf(asset: AssetRecord): string | undefined {
  const meta = (asset.meta_json ?? null) as { alt?: unknown } | null;
  return typeof meta?.alt === "string" && meta.alt.trim().length > 0 ? meta.alt : undefined;
}

/** Every harvested/uploaded image of this audit that can actually be read from
 *  disk, as base64 data URLs — regardless of `status`, because a row's status
 *  describes the ingest pipeline, not whether the picture can end up on the
 *  page. Unreadable files are skipped honestly rather than faked; the caller
 *  falls back to the keyword heuristic for anything it gets no answer for. */
export function prepareAssetsForClassification(auditId: string): ClassifiableImage[] {
  const real = listAssets(auditId).filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image");
  const out: ClassifiableImage[] = [];
  for (const asset of real.slice(0, MAX_CLASSIFIED_IMAGES)) {
    if (!asset.storage_path) continue;
    try {
      const buffer = readFileSync(resolveAssetFilePath(asset.storage_path));
      const alt = altOf(asset);
      out.push({
        asset_id: asset.id,
        data_url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
        ...(alt ? { alt } : {}),
      });
    } catch {
      // Missing/unreadable on disk — skip, never fabricate an input.
    }
  }
  return out;
}
