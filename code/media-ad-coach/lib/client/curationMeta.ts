// ISS-018: read the backend's After-page curation decision off an asset's
// meta_json. Backend ISS-017 (lib/improve/curate.ts) persists
// `meta_json.after_curation = { include, group, reason }`; earlier the preview
// page only looked at flat `selection_reason`/`keep_reason`/`reason`, so a
// live-curated reason never rendered. Pure + frontend-owned so it stays
// unit-testable; the legacy flat keys are kept as a fallback.

export type AfterOriginalGroup = "credential" | "real_photo";

export type CurationMeta = {
  reason: string | null;
  group: AfterOriginalGroup | null;
};

export function extractCurationMeta(metaJson: unknown): CurationMeta {
  const meta =
    metaJson && typeof metaJson === "object" ? (metaJson as Record<string, unknown>) : null;
  if (!meta) return { reason: null, group: null };

  const afterCuration =
    meta.after_curation && typeof meta.after_curation === "object"
      ? (meta.after_curation as Record<string, unknown>)
      : null;

  // after_curation.reason first (the real key), then the legacy flat fallbacks.
  const rawReason =
    afterCuration?.reason ?? meta.selection_reason ?? meta.keep_reason ?? meta.reason;
  const reason = typeof rawReason === "string" && rawReason.trim().length > 0 ? rawReason : null;

  const rawGroup = afterCuration?.group;
  const group = rawGroup === "credential" || rawGroup === "real_photo" ? rawGroup : null;

  return { reason, group };
}
