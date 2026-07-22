// F-040 (create) + F-046 (history). Owner B.
//
// Relative imports (not the "@/..." alias) on purpose: vitest in this repo
// has no tsconfig-paths plugin wired up, so "@/lib/..." fails to resolve
// when tests import these route handlers directly (verified empirically —
// see tests/api.test.ts). Next.js itself resolves "@/..." fine via
// webpack/turbopack, but staying relative here keeps the route handlers
// importable from both.
import type { z } from "zod";
import { createAudit, listAudits } from "../../../lib/db";
import { BusinessInput } from "../../../lib/schemas";

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Plan §5.4 / F-040: at least one presence link, pasted text, or an
 *  already-uploaded asset is required. `has_attachments` is a create-time
 *  signal (not part of the frozen BusinessInput schema — see lib/schemas.ts
 *  BusinessInput comment) that lets the client create the audit row first
 *  and attach files afterwards (F-064: create -> upload -> analyze). The
 *  real, final gate against attached assets runs again in
 *  POST /audits/:id/analyze (F-042), so has_attachments:true never actually
 *  bypasses the rule — it only defers the check. */
function hasSufficientInput(business: z.infer<typeof BusinessInput>, hasAttachments: boolean): boolean {
  const presence = business.presence;
  const hasPresenceLink = Boolean(
    presence.website || presence.maps || presence.yellow_pages || (presence.other && presence.other.length > 0)
  );
  const hasPastedText = Boolean(business.pasted_text && business.pasted_text.trim().length > 0);
  return hasPresenceLink || hasPastedText || hasAttachments;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { has_attachments, mode, ...rest } = body as Record<string, unknown>;
  const parsed = BusinessInput.safeParse(rest);
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  if (!hasSufficientInput(parsed.data, has_attachments === true)) {
    return Response.json(
      {
        error:
          "Provide at least one presence link (website/maps/yellow_pages/other), pasted text, or set has_attachments:true when images will be uploaded next.",
      },
      { status: 400 }
    );
  }

  // `mode` is a route-level extension (not part of the frozen BusinessInput
  // schema — same pattern as has_attachments): an OPTIONAL per-request
  // override for the landing page's "sample report" link (F-060) and the
  // Wi-Fi-off demo drill. REPLAY is opt-in per request ONLY: a user pasting
  // their own links must always get a real LIVE run — replaying the recorded
  // fixture against someone else's input silently shows them another
  // business's report. The offline demo enters REPLAY through the sample
  // page / an explicit `mode:"replay"`, never through a global env switch.
  const executionMode = mode === "replay" ? "REPLAY" : "LIVE";
  const audit = createAudit({
    business_json: parsed.data,
    status: "draft",
    execution_mode: executionMode,
  });

  return Response.json({ auditId: audit.id }, { status: 201 });
}

export async function GET(): Promise<Response> {
  const audits = listAudits();
  const history = audits.map((audit) => {
    const business = audit.business_json as { brand_name?: unknown; trade?: unknown } | null;
    return {
      id: audit.id,
      created_at: audit.created_at,
      brand_name: typeof business?.brand_name === "string" ? business.brand_name : null,
      trade: typeof business?.trade === "string" ? business.trade : null,
      overall_score: audit.overall_score,
      status: audit.status,
      execution_mode: audit.execution_mode,
    };
  });

  // listAudits() already orders by created_at DESC (lib/db.ts) — newest first.
  return Response.json(history);
}
