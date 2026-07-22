// F-065..F-068 shared plumbing: maps a raw `assets.storage_path` value (or a
// fixture's `/fixtures/...` public path) to a browser-fetchable URL. Pure
// function, no imports — usable from both server (app/audit/[id]/page.tsx)
// and client (components/report/*) code.
//
// Rules:
//   - null/undefined                 -> null (nothing to render)
//   - starts with "/"                -> returned as-is (public/ fixture assets)
//   - starts with "storage/"         -> "/assets/" + remainder (served by
//                                        app/assets/[...path]/route.ts)
//   - anything else (bare relative path under the storage root)
//                                     -> "/assets/" + path
export function assetUrl(storagePath: string | null): string | null {
  if (storagePath === null || storagePath === undefined) return null;
  if (storagePath.startsWith("/")) {
    // Legacy rows (pre relative-path convention) stored an ABSOLUTE
    // filesystem path like "/Users/.../storage/images/<id>/img-1.jpg" —
    // remap anything under a "/storage/" segment to the served /assets/
    // route instead of leaking the filesystem path into an <img> src.
    const marker = "/storage/";
    const idx = storagePath.indexOf(marker);
    if (idx !== -1) return "/assets/" + storagePath.slice(idx + marker.length);
    return storagePath; // public/ fixture assets ("/fixtures/...")
  }
  if (storagePath.startsWith("storage/")) {
    return "/assets/" + storagePath.slice("storage/".length);
  }
  return "/assets/" + storagePath;
}

// REPLAY assets: lib/pipeline/orchestrator.ts#runReplayPipeline re-inserts
// every fixture asset with a FRESH db-generated uuid `id`, but
// report.images.criteria_by_asset keys, finding.asset_ref, and channel
// before_json refs are all baked into the fixture using the fixture's
// ORIGINAL ids ("web-img-1", "gen-img-hero", ...). The replay importer
// preserves that id in metadata so generated assets still resolve when their
// filename differs (for example gen-img-hero -> after-hero.jpg). Older
// fixtures fall back to the filename stem. LIVE assets keep matching on their
// database id and are unaffected.
//
// Rules:
//   - null/undefined                          -> null
//   - "/fixtures/.../web-img-1.jpg"            -> "web-img-1"
//   - "storage/images/<auditId>/img-3.jpg"     -> "img-3"
//   - no filename segment (e.g. trailing "/")  -> null
export function deriveAssetRef(
  storagePath: string | null | undefined,
  metaJson?: unknown
): string | null {
  if (metaJson && typeof metaJson === "object" && !Array.isArray(metaJson)) {
    const replayRef = (metaJson as Record<string, unknown>).replay_fixture_asset_id;
    if (typeof replayRef === "string" && replayRef.length > 0) return replayRef;
  }
  if (!storagePath) return null;
  const filename = storagePath.split("/").pop();
  if (!filename) return null;
  const stem = filename.replace(/\.[^./]+$/, "");
  return stem.length > 0 ? stem : null;
}
