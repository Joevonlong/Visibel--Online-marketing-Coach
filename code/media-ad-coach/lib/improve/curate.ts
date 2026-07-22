/**
 * ISS-017 — After-page original-photo curation. The optimized "After" page is
 * NEW-by-default: it showcases the freshly generated AI concepts and enhanced
 * images. An ORIGINAL site photo is allowed back into the After composition
 * ONLY when it is genuinely worth showing — it must clear the ISS-014
 * photo-scale gate (never a logo/favicon/wordmark) AND be either a high-value
 * real photo (a good, large, well-scored image) or an important credential
 * asset (certificate / license / award / Meister proof). Weak, blurry,
 * thumbnail-scale, or unscored originals are replaced by a new concept instead.
 *
 * The classifier is pure and deterministic so both the preview gallery
 * (lib/improve/preview.ts) and the persisted per-asset reason
 * (recordAfterCuration below, read by the After-page UI / FEA-110) share ONE
 * source of truth. The Before panel is unaffected — "what customers see today"
 * still shows every original honestly.
 */
import { listAssets, updateAsset, type AssetRecord } from "../db";
import { isLogoScaleImage } from "../pipeline/images";
import type { PreviewJson } from "../schemas";

export type AfterOriginalGroup = "real_photo" | "credential";

export interface AfterCuration {
  include: boolean;
  group: AfterOriginalGroup | null;
  reason: string;
}

// Summed I1-I6 (max 30). >= 18 is an average of 3/5 across the rubric — a
// genuinely presentable photo rather than a weak or blurry one.
const MIN_HIGH_VALUE_SCORE = 18;
// A real showcase photo, not a thumbnail. The ISS-014 gate only rules out
// sub-100px logo scale; a 120px gallery thumbnail clears that yet is still too
// small to headline an "After" page.
const MIN_SHOWCASE_SHORT_EDGE = 400;

// Certificate / license / award / trade-qualification hints, matched against an
// asset's alt text, source URL, and stored src. German + English trust vocab.
const CREDENTIAL_HINT =
  /(zertifikat|zertifiziert|certificate|certified|urkunde|meister|innung|handwerkskammer|t[üu]v|gepr[üu]ft|siegel|auszeichnung|award|pr[üu]fzeichen|lizenz|license|qualifikation|guarantee|garantie)/i;

interface AssetImageMeta {
  width?: unknown;
  height?: unknown;
  alt?: unknown;
  src?: unknown;
}

function readDimensions(asset: AssetRecord): { width: number | null; height: number | null } {
  const meta = (asset.meta_json ?? null) as AssetImageMeta | null;
  const width = typeof meta?.width === "number" ? meta.width : null;
  const height = typeof meta?.height === "number" ? meta.height : null;
  return { width, height };
}

/** Summed I1-I6 sub-scores, or null when the asset was never vision-scored
 *  (e.g. a fresh upload, or a fixture asset) — an unscored photo cannot be
 *  proven high-value, so under new-by-default it is not showcased. */
function summedImageScore(asset: AssetRecord): number | null {
  const criteria = asset.score_json;
  if (!Array.isArray(criteria) || criteria.length === 0) return null;
  return criteria.reduce((sum: number, entry) => {
    const score = (entry as { score?: unknown } | null)?.score;
    return sum + (typeof score === "number" ? score : 0);
  }, 0);
}

// ISS-019/ISS-020: the content signals available for classifying an asset WITHOUT a
// fresh model call — the Visual Director's per-criterion evidence (score_json),
// the alt text, and the source filename/URL. Joined + lowercased once.
export function contentText(asset: AssetRecord): string {
  const meta = (asset.meta_json ?? null) as AssetImageMeta | null;
  const evidence = Array.isArray(asset.score_json)
    ? asset.score_json.map((c) => (c as { evidence?: unknown } | null)?.evidence).filter((e): e is string => typeof e === "string")
    : [];
  return [asset.source, meta?.src, meta?.alt, ...evidence]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
}

// ISS-019: an image whose content is dominated by text/signage (flyers, price
// lists, service-slider graphics, screenshots) — image models garble text on
// `images.edit`, so such a source must never be enhanced, and a baked enhanced
// derived from one is garbled and must not be shown.
const TEXT_HEAVY_HINT =
  /(text overlay|text-overlay|price list|price-list|preisliste|preis|menu|menü|angebotsschild|schild|plakat|poster|flyer|flier|banner|slider|screenshot|leistungsübersicht|service.?list|marketing graphic|graphic with|signage|wordmark|logo strip|headline overlay|phone.?number banner|auto-start)/i;

/** True when existing vision/asset metadata says this image is text-bearing
 *  (ISS-019). Pure and exported so the enhance path (lib/improve/image.ts) and
 *  the composition dedupe share one definition. */
export function isTextHeavySource(asset: AssetRecord): boolean {
  return TEXT_HEAVY_HINT.test(contentText(asset));
}

// ISS-020: genuine work / team / premises / vehicle imagery — the only content
// (besides a credential) that belongs in the "Credentials & real work" block.
const WORK_HINT =
  /(real photo|on[\s-]?site|job[\s-]?site|at work|working on|installation|installing|\binstall\b|repair|reparatur|montage|wartung|servicing|sanierung|renovat|before|after|vorher|nachher|finished|fertig|completed|\bteam\b|owner|inhaber|mitarbeiter|crew|\bstaff\b|workshop|werkstatt|premises|storefront|shopfront|laden|filiale|showroom|\bvan\b|vehicle|fahrzeug|truck|transporter|bathroom|bad(?:ezimmer)?|kitchen|k[üu]che|boiler|gastherme|heizung|drain|\brohr|\bpipe|leak|plumber|technician|handwerker|\bjob\b|\bwork\b)/i;

// ISS-020: novelty / stock / marketing / screenshot content — NEVER genuine
// proof of work, so it is excluded from the credentials block even if it scores
// or sizes well (the score/dimension gate alone has no work-relevance check —
// the dog-in-a-pipe stock shot and the price-list screenshot the critic saw).
// Specific non-work phrases only — deliberately NOT bare "text overlay" /
// "banner" / "slider" (a genuine photo's I5 evidence often says "no text
// overlay", which must not false-trigger).
const NON_WORK_HINT =
  /(novelty|stock photo|stock image|mascot|cartoon|clip[\s-]?art|\bmeme\b|price[\s-]?list|preisliste|marketing graphic|promotional graphic|slider graphic|graphic listing|graphic with text|text-heavy graphic|screenshot|\bflyer\b|\bflier\b|plakat|wordmark|watermark|\bmenu\b|men[üu]\b|\bdog\b|\bcat\b|\banimal\b)/i;

type AssetContent = "credential" | "non_work" | "work" | "unknown";

/** ISS-020: classifies an original's CONTENT from existing vision descriptions
 *  + alt + src. Precedence: a credential asset first, then non-work
 *  (novelty/stock/marketing/screenshot) which is always excluded, then genuine
 *  work/team/premises/vehicle, else unknown. Pure — exported for tests. */
export function classifyContent(asset: AssetRecord): AssetContent {
  const text = contentText(asset);
  if (CREDENTIAL_HINT.test(text)) return "credential";
  if (NON_WORK_HINT.test(text)) return "non_work";
  if (WORK_HINT.test(text)) return "work";
  return "unknown";
}

/** Decides whether ONE original (harvested/uploaded) photo may appear in the
 *  After composition, and records why. Pure — the caller only passes real
 *  originals (generated concepts are always kept and never routed here). */
export function curateAfterOriginal(asset: AssetRecord): AfterCuration {
  const { width, height } = readDimensions(asset);

  // ISS-014 gate: a logo / favicon / wordmark is never an "Original" photo,
  // let alone an After-page showcase.
  if (isLogoScaleImage(width, height)) {
    return { include: false, group: null, reason: "Excluded: logo/icon-scale asset (ISS-014 gate), not a real photo." };
  }

  const dimText = width && height ? `${width}×${height}` : "size unknown";
  const content = classifyContent(asset);

  // ISS-020: a credential / trust asset — valued for what it proves, not for
  // showcase polish, so it is kept without the showcase-size bar (still past the
  // logo gate above).
  if (content === "credential") {
    return {
      include: true,
      group: "credential",
      reason: `Kept: credential/trust asset (certificate, license, award, or qualification), ${dimText}.`,
    };
  }

  // ISS-020: novelty / stock / marketing / screenshot content is NEVER genuine
  // proof of work — excluded from the credentials block regardless of how well
  // it scores or sizes (the very images the report itself flags as weak).
  if (content === "non_work") {
    return {
      include: false,
      group: null,
      reason: "Excluded: novelty/stock/marketing/screenshot image — not genuine proof of the business's work.",
    };
  }

  const score = summedImageScore(asset);
  const shortEdge = width && height ? Math.min(width, height) : 0;
  const bigEnough = shortEdge >= MIN_SHOWCASE_SHORT_EDGE;

  // ISS-020 + ISS-017: only genuine work/team/premises/vehicle content that is
  // ALSO high-value (well-scored, large) earns a place as a real photo.
  if (content === "work" && score !== null && score >= MIN_HIGH_VALUE_SCORE && bigEnough) {
    return {
      include: true,
      group: "real_photo",
      reason: `Kept: high-value real photo (image score ${score}/30, ${dimText}).`,
    };
  }

  // New-by-default: everything weak / small / unscored / not-clearly-work is
  // replaced by a new AI concept in the After page. Concrete size/score reasons
  // take priority over the generic content note.
  let why: string;
  if (width && height && !bigEnough) why = `too small for showcase (${dimText})`;
  else if (score === null) why = "not vision-scored";
  else if (score < MIN_HIGH_VALUE_SCORE) why = `low image score ${score}/30`;
  else if (content === "unknown") why = "content not identifiable as genuine work";
  else why = "not a showcase-quality work photo";
  return {
    include: false,
    group: null,
    reason: `Excluded: ${why} — replaced by a new AI concept in the After page.`,
  };
}

/** Resolves a gallery `asset_ref` to its DB asset in BOTH live and replay: the
 *  baked replay preview references the FIXTURE's original asset ids, while the
 *  replay-seeded DB rows get fresh ids that carry the fixture id in
 *  `meta_json.replay_fixture_asset_id` — so the map is keyed by both. */
function buildAssetRefMap(auditId: string): Map<string, AssetRecord> {
  const byRef = new Map<string, AssetRecord>();
  for (const a of listAssets(auditId)) {
    byRef.set(a.id, a);
    const fixtureId = (a.meta_json as { replay_fixture_asset_id?: unknown } | null)?.replay_fixture_asset_id;
    if (typeof fixtureId === "string") byRef.set(fixtureId, a);
  }
  return byRef;
}

function isOriginalAsset(asset: AssetRecord | undefined): asset is AssetRecord {
  return !!asset && (asset.kind === "harvested_image" || asset.kind === "uploaded_image");
}

/** ISS-019 — one source, one treatment. Enforced at composition time so it
 *  covers BOTH the live gallery and the REPLAY baked gallery:
 *   1. Drop a baked ENHANCED image whose edit source is text-heavy — image
 *      models garble text, so that derivative is fake-looking (the source is
 *      never enhanced in a live run either; see lib/improve/image.ts).
 *   2. A source that IS shown as an enhanced derivative is not ALSO shown raw:
 *      the raw original is dropped so no photo appears twice with two
 *      treatments. Pure over the resolved asset map — exported for tests. */
export function applyOneSourceOneTreatment(
  gallery: PreviewJson["gallery"],
  byRef: Map<string, AssetRecord>,
): PreviewJson["gallery"] {
  const dropEnhancedRefs = new Set<string>();
  const treatedSourceIds = new Set<string>();

  for (const entry of gallery) {
    const asset = byRef.get(entry.asset_ref);
    if (asset?.label !== "enhanced") continue;
    const sourceId = (asset.meta_json as { source_asset_id?: unknown } | null)?.source_asset_id;
    if (typeof sourceId !== "string") continue;
    const sourceAsset = byRef.get(sourceId);
    if (sourceAsset && isTextHeavySource(sourceAsset)) {
      dropEnhancedRefs.add(entry.asset_ref); // garbled derivative — remove it
    } else {
      treatedSourceIds.add(sourceId); // this source is already presented, once
    }
  }

  return gallery.filter((entry) => {
    if (dropEnhancedRefs.has(entry.asset_ref)) return false;
    const asset = byRef.get(entry.asset_ref);
    if (isOriginalAsset(asset)) {
      const fixtureId = (asset.meta_json as { replay_fixture_asset_id?: unknown } | null)?.replay_fixture_asset_id;
      if (treatedSourceIds.has(entry.asset_ref) || (typeof fixtureId === "string" && treatedSourceIds.has(fixtureId))) {
        return false; // already shown as an enhanced derivative
      }
    }
    return true;
  });
}

/** ISS-017 + ISS-019: applies the After-curation policy AND the one-source-one-
 *  treatment rule to an already-assembled gallery (the REPLAY branch shows the
 *  fixture's baked `preview_json`). Drops originals that fail curation, drops a
 *  garbled enhanced whose source is text-heavy, and never shows a source both
 *  enhanced and raw. Deterministic — same classifiers as the live gallery. */
export function filterGalleryByCuration(auditId: string, gallery: PreviewJson["gallery"]): PreviewJson["gallery"] {
  const byRef = buildAssetRefMap(auditId);
  const curated = gallery.filter((entry) => {
    const asset = byRef.get(entry.asset_ref);
    if (isOriginalAsset(asset)) return curateAfterOriginal(asset).include;
    return true;
  });
  return applyOneSourceOneTreatment(curated, byRef);
}

/** ISS-017: persists each original's After-selection decision onto its
 *  `meta_json.after_curation` so the After-page UI (FEA-110) can label and
 *  group the surviving originals ("your best photo", "certificate") without
 *  re-deriving the policy. Idempotent — safe to call on every preview
 *  assembly. Generated images are left untouched. */
export function recordAfterCuration(auditId: string): void {
  for (const asset of listAssets(auditId)) {
    if (asset.kind !== "harvested_image" && asset.kind !== "uploaded_image") continue;
    const curation = curateAfterOriginal(asset);
    const meta = (asset.meta_json ?? {}) as Record<string, unknown>;
    updateAsset(asset.id, { meta_json: { ...meta, after_curation: curation } });
  }
}
