// F-044: GET /api/audits/:id — the 1s polling endpoint. Owner B.
import { getAudit, listChannels, listProgressEvents } from "../../../../lib/db";
// Relative import on purpose — tests import this route handler directly and
// vitest here has no "@/..." resolution (see the note in app/api/audits/route.ts).
import { redactChannelAfter } from "../../../../components/report/generationStatus";

/** channels.findings_json is stored as whatever the rubric/orchestrator
 *  writer put there (lib/db.ts is intentionally schema-agnostic — see its
 *  header comment); today's fixture-shaped rows (tests/db.test.ts) store
 *  full finding objects with an `id` field, so we accept either that or a
 *  bare id string and normalize to the Channel schema's `finding_ids`. */
function extractFindingIds(findingsJson: unknown): string[] {
  if (!Array.isArray(findingsJson)) return [];
  return findingsJson.map((entry) => {
    if (entry && typeof entry === "object" && "id" in entry && typeof (entry as { id: unknown }).id === "string") {
      return (entry as { id: string }).id;
    }
    return String(entry);
  });
}

function extractBeforeScreenshot(evidenceJson: unknown): unknown {
  if (!evidenceJson || typeof evidenceJson !== "object") return null;
  return (evidenceJson as Record<string, unknown>).before_screenshot ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const audit = getAudit(id);
  if (!audit) {
    return Response.json({ error: `No audit found with id "${id}".` }, { status: 404 });
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
          // ISS-030: raw provider error text never leaves the server.
          after: redactChannelAfter(row.after_json),
        }))
      : null;

  // FEA-112: images are generated AFTER the audit reports "complete", so the
  // poller needs its own liveness signal for them — `status: "complete"` alone
  // no longer means "everything has landed". A client keeps polling (and keeps
  // showing the honest "generating" placeholder) while this is > 0.
  const imagesPending = channelRows.filter((row) => row.lane === "image" && row.status === "improving").length;

  return Response.json({
    status: audit.status,
    images_pending: imagesPending,
    execution_mode: audit.execution_mode,
    progress,
    report: audit.report_json ?? null,
    channels,
    before_screenshot: extractBeforeScreenshot(audit.evidence_json),
    preview_ready: audit.preview_json !== null,
    overall_score: audit.overall_score,
  });
}
