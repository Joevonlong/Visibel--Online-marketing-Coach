// Frontend-owned static file server for images living under storage/ (NOT
// under app/api/ — this is plain file serving for <img> tags, not a JSON
// API route). Serves harvested/uploaded/generated images at
// /assets/<relative-path>, where <relative-path> mirrors the `storage_path`
// column written by lib/db.ts asset rows (e.g. "uploads/<auditId>/<file>",
// "images/<auditId>/img-1.jpg"). See lib/client/assets.ts#assetUrl for the
// storage_path -> URL mapping this route is the other half of.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function storageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return path.join(process.cwd(), "storage");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path: segments } = await params;

  if (!segments || segments.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const root = path.resolve(storageRoot());
  const resolved = path.resolve(root, ...segments);

  // Path traversal guard: the resolved path must stay inside the storage
  // root (blocks "..", absolute-path segments, and symlink-style escapes at
  // the string level).
  const withinRoot = resolved === root || resolved.startsWith(root + path.sep);
  if (!withinRoot) {
    return new Response("Not found", { status: 404 });
  }

  let fileStat;
  try {
    fileStat = await stat(resolved);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!fileStat.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  // ISS-032: a generated image is REPLACED IN PLACE — the streamed partial and
  // the final frame share one path (FEA-112). "immutable" was therefore a lie
  // for exactly the files that change, and it froze the soft partial in the
  // browser forever. Now: a request carrying the mtime stamp that
  // app/_lib/assetVersion.ts adds (`?v=`) IS content-addressed and may be
  // cached hard; an unstamped request must revalidate, and the ETag makes that
  // cheap (a 304 with no body when the bytes have not moved).
  const versioned = new URL(request.url).searchParams.has("v");
  const etag = `"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}"`;
  const cacheControl = versioned ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate";

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }

  const nodeStream = createReadStream(resolved);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileStat.size),
      "Cache-Control": cacheControl,
      ETag: etag,
    },
  });
}
