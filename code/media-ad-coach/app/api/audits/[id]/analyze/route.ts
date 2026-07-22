// F-042: POST /api/audits/:id/analyze — kicks the async pipeline. Owner B.
import { getAudit, listAssets, updateAudit } from "../../../../../lib/db";
import { runAnalyzeAndRecordFailure } from "../../../../../lib/server/runners";

/** Plan §5.4/F-040/F-042 combined rule: at least one presence link, pasted
 *  text, or an already-uploaded asset. Assets are checked here (not just at
 *  create time) because F-064's flow is create -> upload -> analyze, and
 *  has_attachments:true at create time only defers this check to now. */
function hasAnalyzableInput(businessJson: unknown, assetCount: number): boolean {
  if (assetCount > 0) return true;
  if (!businessJson || typeof businessJson !== "object") return false;

  const business = businessJson as {
    presence?: { website?: string; maps?: string; yellow_pages?: string; other?: string[] };
    pasted_text?: string;
  };
  const presence = business.presence ?? {};
  const hasPresenceLink = Boolean(
    presence.website || presence.maps || presence.yellow_pages || (presence.other && presence.other.length > 0)
  );
  const hasPastedText = Boolean(business.pasted_text && business.pasted_text.trim().length > 0);
  return hasPresenceLink || hasPastedText;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const audit = getAudit(id);
  if (!audit) {
    return Response.json({ error: `No audit found with id "${id}".` }, { status: 404 });
  }

  if (audit.status === "analyzing" || audit.status === "improving") {
    return Response.json({ error: `Audit "${id}" is already ${audit.status}.` }, { status: 409 });
  }

  const assetCount = listAssets(id).length;
  if (!hasAnalyzableInput(audit.business_json, assetCount)) {
    return Response.json(
      {
        error: "Nothing to analyze yet — add a presence link, paste some text, or upload at least one image first.",
      },
      { status: 400 }
    );
  }

  updateAudit(id, { status: "analyzing" });

  // Fire-and-forget: POST must return <1s (F-042 accept criterion). Errors
  // are handled and persisted inside runAnalyzeAndRecordFailure, so this
  // intentionally has no .catch() here — void marks the non-await as
  // deliberate rather than a bug.
  void runAnalyzeAndRecordFailure(id);

  return Response.json({ status: "analyzing" }, { status: 202 });
}
