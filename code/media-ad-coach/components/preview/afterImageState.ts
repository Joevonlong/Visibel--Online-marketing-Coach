// ISS-029: decides what the After page is actually showing in each image slot,
// so a fallback can never pass itself off as an optimization result.
//
// The hazard (FACT, lib/improve/preview.ts#resolveImageRef): when image
// generation fails, the preview silently falls back to a REAL photo harvested
// from the business's own website during this audit — the very same picture the
// Before side shows. AfterPanel then rendered it with no badge and no note, so
// the identical photo appeared on both sides and the right-hand one read as
// "the improved version".
//
// Two sources of truth, in order:
//   1. `image_source` / `generation_error_reason` on the preview payload
//      (ISS-028). `PreviewJson` models both fields and degrades an
//      unrecognized value rather than failing the whole parse (ISS-031), so
//      the caller passes the VALIDATED object. Still read defensively here:
//      legacy rows written before ISS-028 carry neither field, and an
//      unrecognized `image_source` is dropped by the schema, which lands in
//      the same "not declared" branch.
//   2. Otherwise the asset label, which the product already treats as the
//      generated/real distinction (FEA-110): a generated or edited image
//      carries "ai_concept" / "enhanced"; a harvested original carries none.
//
// Pure module — no React — so it is testable in this repo's node-only vitest.

export type AfterImageSource = "generated" | "harvested_fallback" | "none";

/** What the page was told about one image slot, straight from preview_json. */
export type AfterImageMeta = {
  /** Backend-declared source; null when the field is absent. */
  declaredSource: "generated" | "harvested_fallback" | null;
  /** Raw machine reason for the failure — NEVER rendered; mapped to
   *  allowlisted copy at the render site (ISS-030). */
  generationErrorReason: string | null;
  /**
   * ISS-032 / FEA-112: the image on screen is a real streamed PARTIAL of the
   * very image being generated; a sharper final frame is still on its way.
   * The slot says so and the poller keeps the page live until it lands.
   */
  generationPending: boolean;
};

export type AfterImageMetaBundle = {
  hero: AfterImageMeta;
  team: AfterImageMeta;
};

const EMPTY_META: AfterImageMeta = {
  declaredSource: null,
  generationErrorReason: null,
  generationPending: false,
};

export const EMPTY_AFTER_IMAGE_META: AfterImageMetaBundle = { hero: EMPTY_META, team: EMPTY_META };

function readSlot(record: unknown): AfterImageMeta {
  if (!record || typeof record !== "object") return EMPTY_META;
  const slot = record as Record<string, unknown>;
  const source = slot.image_source;
  const reason = slot.generation_error_reason;
  return {
    declaredSource:
      source === "generated" || source === "harvested_fallback" ? source : null,
    generationErrorReason: typeof reason === "string" && reason.trim().length > 0 ? reason : null,
    generationPending: slot.generation_pending === true,
  };
}

/** Reads the optional ISS-028 provenance fields off a preview payload (the
 *  validated `PreviewJson`; a raw blob also works, the reads are structural).
 *  Safe on every legacy row: absent fields simply yield nulls and the label
 *  heuristic takes over. */
export function readAfterImageMeta(rawPreviewJson: unknown): AfterImageMetaBundle {
  if (!rawPreviewJson || typeof rawPreviewJson !== "object") return EMPTY_AFTER_IMAGE_META;
  const preview = rawPreviewJson as Record<string, unknown>;
  return { hero: readSlot(preview.hero), team: readSlot(preview.about_team) };
}

/**
 * Final verdict for one image slot.
 * @param hasImage    whether an asset actually resolved to a renderable url
 * @param assetLabel  the resolved asset's truth label, if any
 * @param meta        backend-declared source, when available
 */
export function resolveAfterImageSource(
  hasImage: boolean,
  assetLabel: string | null | undefined,
  meta: AfterImageMeta = EMPTY_META
): AfterImageSource {
  if (!hasImage) return "none";
  if (meta.declaredSource === "generated") return "generated";
  if (meta.declaredSource === "harvested_fallback") return "harvested_fallback";
  // No declaration: a labelled asset is generated/edited output, an unlabelled
  // one is a real photo of the business standing in for a missing generation.
  return assetLabel === "ai_concept" || assetLabel === "enhanced" ? "generated" : "harvested_fallback";
}
