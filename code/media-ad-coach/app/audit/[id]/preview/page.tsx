// F-074: server entry point for the Before/After preview overlay. Reads the
// audit + assets straight from lib/db (no HTTP round trip, same pattern as
// app/audit/[id]/page.tsx). preview_json is assembled elsewhere (F-054,
// lib/improve/preview.ts) — this route only reads, parses defensively, and
// renders; it never re-derives preview content itself.
import { notFound } from "next/navigation";

import { getAudit, listAssets } from "@/lib/db";
import { assetUrl, deriveAssetRef } from "@/lib/client/assets";
import { assetVersionedUrl } from "@/app/_lib/assetVersion";
import { extractCurationMeta } from "@/lib/client/curationMeta";
import { screenshotFailureCopy, screenshotFailureDiagnostics } from "@/lib/client/screenshotStatus";
import { PreviewJson } from "@/lib/schemas";
import { PillButton } from "@/components/primitives/PillButton";
import { PreviewOverlay } from "@/components/preview/PreviewOverlay";
import type { BeforeScreenshotPresentation } from "@/components/preview/BeforePanel";
import { parsePreviewSitePage } from "@/components/preview/navigation";
import { readAfterImageMeta } from "@/components/preview/afterImageState";
import type { AssetLookup } from "@/components/preview/types";

export const dynamic = "force-dynamic";

function resolveBeforeScreenshot(evidence: unknown): BeforeScreenshotPresentation | null {
  if (!evidence || typeof evidence !== "object") return null;
  const screenshot = (evidence as Record<string, unknown>).before_screenshot;
  if (!screenshot || typeof screenshot !== "object") return null;
  const record = screenshot as Record<string, unknown>;
  if (record.ok === true && typeof record.storage_path === "string") {
    return { url: assetUrl(record.storage_path), detail: null };
  }
  if (record.ok === false) {
    // ISS-023: raw exception text stays in the server log, never in the UI.
    const diagnostics = screenshotFailureDiagnostics(record);
    if (diagnostics) console.warn("[preview] before_screenshot unavailable:", diagnostics);
    return { url: null, detail: screenshotFailureCopy(record) };
  }
  return null;
}

function OverlayEmptyState({
  auditId,
  title,
  description,
}: {
  auditId: string;
  title: string;
  description: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-section-title text-ink">{title}</h1>
        <p className="text-body text-ink-secondary">{description}</p>
        <PillButton href={`/audit/${auditId}`} variant="primary">
          Back to channel list
        </PillButton>
      </div>
    </div>
  );
}

export default async function AuditPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ site?: string | string[] }>;
}) {
  const { id } = await params;
  const { site } = await searchParams;
  const audit = getAudit(id);
  if (!audit) {
    notFound();
  }

  if (audit.preview_json === null) {
    return (
      <OverlayEmptyState
        auditId={id}
        title="Not ready yet"
        description={
          '"Do It For You" hasn’t finished rebuilding this page. Head back to the channel list and kick it off — the preview unlocks the moment it completes.'
        }
      />
    );
  }

  const parsed = PreviewJson.safeParse(audit.preview_json);
  if (!parsed.success) {
    return (
      <OverlayEmptyState
        auditId={id}
        title="Preview couldn’t be read"
        description="The assembled preview didn’t match the expected shape, so nothing was rendered in its place. Nothing here is faked — try again from the channel list."
      />
    );
  }

  // Keyed by BOTH the db `id` and the fixture-derived `ref` (see
  // lib/client/assets.ts#deriveAssetRef) — REPLAY's preview_json refs are
  // baked from the fixture's original asset ids, which no longer match the
  // fresh uuids runReplayPipeline assigns on insert. `ref` entries are
  // written first so a same-named `id` always wins on lookup.
  const assetsById: AssetLookup = {};
  for (const asset of listAssets(id)) {
    // FEA-110 / ISS-017 / ISS-018: pick up the backend After-page curation
    // decision (meta_json.after_curation = {group, reason}). Absent in the
    // replay fixture → stays null and the UI degrades gracefully.
    const { reason, group } = extractCurationMeta(asset.meta_json);
    // ISS-032 / FEA-112: `partial_only` marks a streamed partial whose final
    // frame never arrived — a real image of this business, just soft. Read
    // defensively; absent on every pre-FEA-112 row.
    const assetMeta =
      asset.meta_json && typeof asset.meta_json === "object"
        ? (asset.meta_json as Record<string, unknown>)
        : null;
    const value: AssetLookup[string] = {
      // ISS-032: stamp the file mtime so an in-place replaced image re-paints.
      url: assetVersionedUrl(assetUrl(asset.storage_path)),
      label: asset.label === "ai_concept" || asset.label === "enhanced" ? asset.label : null,
      reason,
      group,
      partialOnly: assetMeta?.partial_only === true,
    };
    const ref = deriveAssetRef(asset.storage_path, asset.meta_json);
    if (ref) assetsById[ref] = value;
    assetsById[asset.id] = value;
  }

  const business = (audit.business_json ?? {}) as { brand_name?: string };

  // ISS-029 / ISS-031: the per-slot image truth. `PreviewJson` now models the
  // provenance fields (ISS-028) and degrades an unrecognized value instead of
  // failing the parse (ISS-031), so this reads from the validated object — the
  // earlier workaround that reached around it into the raw blob is gone.
  const imageMeta = readAfterImageMeta(parsed.data);

  return (
    <PreviewOverlay
      preview={parsed.data}
      assetsById={assetsById}
      businessName={parsed.data.header.business_name || business.brand_name || "Your business"}
      executionMode={audit.execution_mode}
      auditId={id}
      beforeScreenshot={resolveBeforeScreenshot(audit.evidence_json)}
      sitePage={parsePreviewSitePage(site)}
      imageMeta={imageMeta}
    />
  );
}
