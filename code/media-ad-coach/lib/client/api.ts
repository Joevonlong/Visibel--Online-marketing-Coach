// F-064: browser-safe fetch helpers for the /audit/new submit flow. Only
// this file (lib/client/*) may be added under lib/** per docs/TEAM-SPLIT.md
// — no node imports here, relative type-only imports for lib/schemas per
// AGENTS.md ("@/" only resolves inside app/** and components/**).
import type { BusinessInput } from "../schemas";

/** POST /api/audits body — BusinessInput plus the create-time-only
 *  `has_attachments` escape hatch (docs/CONTRACTS.md "API endpoints"). */
export type CreateAuditBody = BusinessInput & { has_attachments?: boolean };

export type CreateAuditResponse = { auditId: string };

export type UploadAssetKind = "uploaded_image" | "gbp_screenshot";

export type UploadAssetsResponse = { assetIds: string[] };

export type StartAnalyzeResponse = { status: string };

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return fallback;
}

/** POST /api/audits — 201 {auditId} / 400 {error} (docs/CONTRACTS.md). */
export async function createAudit(body: CreateAuditBody): Promise<CreateAuditResponse> {
  const response = await fetch("/api/audits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(json, `Failed to create audit (${response.status}).`));
  }
  return json as CreateAuditResponse;
}

/** POST /api/audits/:id/assets — multipart "files" (+ "kind"). 201
 *  {assetIds[]} / 400 {error} (docs/CONTRACTS.md). No-op on an empty list. */
export async function uploadAssets(
  auditId: string,
  files: File[],
  kind: UploadAssetKind
): Promise<UploadAssetsResponse> {
  if (files.length === 0) return { assetIds: [] };

  const formData = new FormData();
  formData.set("kind", kind);
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch(`/api/audits/${auditId}/assets`, {
    method: "POST",
    body: formData,
  });
  const json = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(json, `Failed to upload files (${response.status}).`));
  }
  return json as UploadAssetsResponse;
}

/** POST /api/audits/:id/analyze — 202 {status:"analyzing"} / 400|409 {error}. */
export async function startAnalyze(auditId: string): Promise<StartAnalyzeResponse> {
  const response = await fetch(`/api/audits/${auditId}/analyze`, { method: "POST" });
  const json = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(errorMessage(json, `Failed to start analysis (${response.status}).`));
  }
  return json as StartAnalyzeResponse;
}
