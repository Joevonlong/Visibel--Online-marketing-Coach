// F-041: POST /api/audits/:id/assets — multipart upload of originals only.
// Normalization into the scored image set happens later in the pipeline
// (lib/pipeline/images.ts, owned elsewhere) — this route just persists what
// was uploaded. Owner B.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAudit, insertAsset } from "../../../../../lib/db";

const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_KINDS = new Set(["uploaded_image", "gbp_screenshot"]);

/** Root of the storage tree. Overridable via APP_STORAGE_DIR so tests write
 *  under a temp dir instead of the real (gitignored) storage/ folder —
 *  mirrors the APP_DB_PATH override pattern already used by lib/db.ts. */
function storageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return join(process.cwd(), "storage");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const audit = getAudit(id);
  if (!audit) {
    return Response.json({ error: `No audit found with id "${id}".` }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Request body must be multipart/form-data." }, { status: 400 });
  }

  const kindRaw = formData.get("kind");
  const kind = kindRaw === null ? "uploaded_image" : String(kindRaw);
  if (!ALLOWED_KINDS.has(kind)) {
    return Response.json(
      { error: `kind must be "uploaded_image" or "gbp_screenshot", got "${kind}".` },
      { status: 400 }
    );
  }

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return Response.json({ error: 'No files provided under the "files" field.' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return Response.json({ error: `Too many files: ${files.length} (max ${MAX_FILES}).` }, { status: 400 });
  }

  // Validate every file before writing any of them, so a bad file in a batch
  // never leaves a partial write behind.
  for (const file of files) {
    const ext = ALLOWED_MIME_EXT[file.type];
    if (!ext) {
      return Response.json(
        {
          error: `Unsupported file type "${file.type}" for "${file.name}" (allowed: image/jpeg, image/png, image/webp).`,
        },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: `"${file.name}" is ${file.size} bytes, exceeds the ${MAX_BYTES}-byte limit.` },
        { status: 400 }
      );
    }
  }

  const uploadDir = join(storageRoot(), "uploads", id);
  await mkdir(uploadDir, { recursive: true });

  const assetIds: string[] = [];
  for (const file of files) {
    const ext = ALLOWED_MIME_EXT[file.type];
    const filename = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(uploadDir, filename), buffer);

    const asset = insertAsset({
      audit_id: id,
      kind,
      // Relative to storageRoot(), not a literal "storage/..." prefix — the
      // previous version ignored APP_STORAGE_DIR here even though the actual
      // write above already respected it, so a consumer resolving
      // storage_path against the real root (e.g. lib/pipeline/orchestrator.ts's
      // resolveRawUploadPath) got the wrong path whenever APP_STORAGE_DIR was
      // set. Storing "uploads/<id>/<file>" and always resolving it against
      // storageRoot() keeps the stored path correct in every environment.
      storage_path: join("uploads", id, filename),
      meta_json: { filename: file.name, mime: file.type, bytes: file.size },
      status: "uploaded",
    });
    assetIds.push(asset.id);
  }

  return Response.json({ assetIds }, { status: 201 });
}
