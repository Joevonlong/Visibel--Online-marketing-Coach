// ISS-032 (FEA-112 fallout): generated images are replaced IN PLACE — the
// streamed partial and the final frame share one asset id and one
// storage_path. A browser that has already painted `/assets/images/<id>/x.png`
// will not re-request it just because the bytes on disk changed, so the sharp
// final frame stays invisible until a manual reload.
//
// Fix: stamp the URL with the file's mtime. Same bytes -> same URL -> cache
// hit; replaced bytes -> new URL -> the <img> re-fetches and re-paints. The
// version is read from the filesystem rather than the database because the
// file is what actually changes (lib/improve/image.ts overwrites the path
// without touching the asset row).
//
// SERVER ONLY — imports node:fs. Lives under app/_lib (a Next private folder,
// never routed) so it can never be pulled into a client bundle.
import { statSync } from "node:fs";
import path from "node:path";

const SERVED_PREFIX = "/assets/";

/** Mirrors app/assets/[...path]/route.ts#storageRoot. */
function storageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return path.join(process.cwd(), "storage");
}

/**
 * Appends `?v=<mtimeMs>` to an `/assets/...` URL.
 *
 * Returns the input unchanged for anything else — `null`, already-versioned
 * URLs, and `/fixtures/...` public assets, which are static build output and
 * genuinely immutable. Any filesystem error is swallowed: a missing version is
 * a stale image at worst, never a broken page.
 */
export function assetVersionedUrl(url: string | null): string | null {
  if (!url || !url.startsWith(SERVED_PREFIX) || url.includes("?")) return url;

  const root = path.resolve(storageRoot());
  const resolved = path.resolve(root, url.slice(SERVED_PREFIX.length));
  // Same traversal guard the serving route applies.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return url;

  try {
    const stats = statSync(resolved);
    if (!stats.isFile()) return url;
    return `${url}?v=${Math.trunc(stats.mtimeMs)}`;
  } catch {
    return url;
  }
}
