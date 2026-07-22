// F-065: server entry point for the report page. Reads the audit straight
// from lib/db (no HTTP round trip needed since we're already on the server)
// and mirrors the exact shape GET /api/audits/:id returns (see
// app/api/audits/[id]/route.ts) so ReportView's polling hook can seed from
// this initial render and then take over via useAuditPoll.
import { notFound } from "next/navigation";

import { getAudit, listAssets, listChannels, listProgressEvents } from "@/lib/db";
import { assetUrl, deriveAssetRef } from "@/lib/client/assets";
import { assetVersionedUrl } from "@/app/_lib/assetVersion";
import { screenshotFailureCopy, screenshotFailureDiagnostics } from "@/lib/client/screenshotStatus";
import type { AssetView, AuditPollResponse } from "@/lib/client/types";
import { ReportView } from "@/components/report/ReportView";
import { redactChannelAfter } from "@/components/report/generationStatus";
import type { GbpEvidenceView } from "@/components/report/DiagnosticModules";
import type { GbpReviewSnippet } from "@/components/report/GbpListingMock";

export const dynamic = "force-dynamic";

/** FEA-108: a human category label for the Maps/SERP mocks. Prefers the
 *  free-text business-type list encoded into `background` (FEA-104), falling
 *  back to the capitalized trade enum. Never invents a category. */
function deriveCategoryLabel(trade: unknown, background: unknown): string | null {
  if (typeof background === "string" && background.startsWith("Business type:")) {
    const label = background.slice("Business type:".length).split(".")[0].trim();
    if (label.length > 0) return label;
  }
  if (typeof trade === "string" && trade.length > 0 && trade !== "other") {
    return trade.charAt(0).toUpperCase() + trade.slice(1);
  }
  return null;
}

/** Mirrors app/audit/[id]/preview/page.tsx#resolveBeforeScreenshot — the
 *  optional LIVE browser capture stored in evidence_json.before_screenshot. */
function resolveBeforeScreenshot(evidence: unknown): { url: string | null; detail: string | null } | null {
  if (!evidence || typeof evidence !== "object") return null;
  const screenshot = (evidence as Record<string, unknown>).before_screenshot;
  if (!screenshot || typeof screenshot !== "object") return null;
  const record = screenshot as Record<string, unknown>;
  if (record.ok === true && typeof record.storage_path === "string") {
    return { url: assetUrl(record.storage_path), detail: null };
  }
  if (record.ok === false) {
    // ISS-023: the stored `detail` is a raw exception message (local paths, CLI
    // banner). It goes to the server log only; the UI gets allowlisted copy.
    const diagnostics = screenshotFailureDiagnostics(record);
    if (diagnostics) console.warn("[report] before_screenshot unavailable:", diagnostics);
    return { url: null, detail: screenshotFailureCopy(record) };
  }
  return null;
}

/** ISS-024 / FEA-101: normalizes the optional live-Maps slice of
 *  `evidence_json.gbp`. Every field is read defensively and defaults to null —
 *  the backend lane owns that blob's shape and the live fields may not be
 *  present yet (or at all, for a REPLAY audit). A null field means "not
 *  verified in this run"; the card renders that as a neutral state, never as
 *  an accusation that the business is missing something. */
function resolveGbpEvidence(evidence: unknown): GbpEvidenceView {
  if (!evidence || typeof evidence !== "object") return null;
  const gbp = (evidence as Record<string, unknown>).gbp;
  if (!gbp || typeof gbp !== "object") return null;
  const record = gbp as Record<string, unknown>;

  const rawSnippets = Array.isArray(record.review_snippets) ? record.review_snippets : [];
  const reviewSnippets = rawSnippets.flatMap((entry): GbpReviewSnippet[] => {
    if (!entry || typeof entry !== "object") return [];
    const snippet = entry as Record<string, unknown>;
    const text = typeof snippet.text === "string" ? snippet.text.trim() : "";
    if (text.length === 0) return [];
    return [
      {
        author: typeof snippet.author === "string" ? snippet.author : null,
        rating: typeof snippet.rating === "number" ? snippet.rating : null,
        text,
      },
    ];
  });

  return {
    phone: typeof record.phone === "string" && record.phone.trim().length > 0 ? record.phone : null,
    openingHoursText:
      typeof record.opening_hours_text === "string" && record.opening_hours_text.trim().length > 0
        ? record.opening_hours_text
        : null,
    hasListingPhotos: typeof record.has_listing_photos === "boolean" ? record.has_listing_photos : null,
    reviewSnippets,
    liveSource: typeof record.live_source === "string" ? record.live_source : null,
  };
}

/** Mirrors app/api/audits/[id]/route.ts#extractFindingIds — channels.findings_json
 *  may hold full finding objects (fixture-shaped rows) or bare id strings. */
function extractFindingIds(findingsJson: unknown): string[] {
  if (!Array.isArray(findingsJson)) return [];
  return findingsJson.map((entry) => {
    if (entry && typeof entry === "object" && "id" in entry && typeof (entry as { id: unknown }).id === "string") {
      return (entry as { id: string }).id;
    }
    return String(entry);
  });
}

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = getAudit(id);
  if (!audit) {
    notFound();
  }

  const progress = listProgressEvents(id).map((event) => ({
    step: event.step,
    at: event.at,
    detail: event.detail,
  }));

  const channelRows = listChannels(id);
  const channels =
    channelRows.length > 0
      ? channelRows.map((row) => ({
          id: row.id,
          lane: row.lane,
          title: row.title,
          one_liner: row.one_liner,
          priority: row.priority,
          severity: row.severity,
          status: row.status,
          finding_ids: extractFindingIds(row.findings_json),
          before: row.before_json,
          // ISS-030: raw provider error text never crosses to the browser,
          // not even as a serialized prop.
          after: redactChannelAfter(row.after_json),
        }))
      : null;

  const initialData = {
    status: audit.status,
    execution_mode: audit.execution_mode,
    progress,
    report: audit.report_json,
    channels,
    preview_ready: audit.preview_json !== null,
    overall_score: audit.overall_score,
  } as AuditPollResponse;

  const assets: AssetView[] = listAssets(id).map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    // ISS-032: stamp the file mtime so an in-place replaced image re-paints.
    url: assetVersionedUrl(assetUrl(asset.storage_path)),
    ref: deriveAssetRef(asset.storage_path, asset.meta_json),
  }));

  const businessJson = (audit.business_json ?? {}) as {
    brand_name?: string;
    trade?: string;
    city?: string;
    background?: string;
    presence?: { website?: string };
  };
  const businessName = businessJson.brand_name ?? null;

  const business = {
    brandName: businessName,
    category: deriveCategoryLabel(businessJson.trade, businessJson.background),
    city: businessJson.city ?? null,
    website: businessJson.presence?.website ?? null,
  };

  const websiteEvidence = (audit.evidence_json as { website?: Record<string, unknown> } | null)?.website;
  const telLinks = Array.isArray(websiteEvidence?.tel_links) ? (websiteEvidence!.tel_links as unknown[]) : [];
  // ISS-024/ISS-025: `contact_phones` is the superset (tel: hrefs PLUS plain-text
  // matches). Prefer it; fall back to raw tel: links for legacy evidence blobs
  // written before ISS-025 landed.
  const contactPhones = Array.isArray(websiteEvidence?.contact_phones)
    ? (websiteEvidence!.contact_phones as unknown[])
    : [];
  const websitePhone =
    (typeof contactPhones[0] === "string" ? (contactPhones[0] as string) : null) ??
    (typeof telLinks[0] === "string" ? (telLinks[0] as string) : null);
  const websiteMeta = {
    title: typeof websiteEvidence?.title === "string" ? websiteEvidence.title : null,
    metaDescription:
      typeof websiteEvidence?.meta_description === "string" ? websiteEvidence.meta_description : null,
    phone: websitePhone,
    https: typeof websiteEvidence?.https === "boolean" ? websiteEvidence.https : null,
    hasImpressum:
      typeof websiteEvidence?.has_impressum === "boolean" ? websiteEvidence.has_impressum : null,
  };

  const beforeScreenshot = resolveBeforeScreenshot(audit.evidence_json);
  const gbpEvidence = resolveGbpEvidence(audit.evidence_json);

  return (
    <ReportView
      auditId={id}
      initialData={initialData}
      assets={assets}
      businessName={businessName}
      business={business}
      websiteMeta={websiteMeta}
      gbpEvidence={gbpEvidence}
      beforeScreenshot={beforeScreenshot}
    />
  );
}
