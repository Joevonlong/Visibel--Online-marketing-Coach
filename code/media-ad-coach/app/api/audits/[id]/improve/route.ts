// F-045: POST /api/audits/:id/improve — validates the request, flips the
// audit to "improving", and fires the engine (lib/improve/orchestrate.ts)
// fire-and-forget. Both page buttons (single-channel "Improve It" and the
// primary "Do It For You") call this one endpoint with either an array of
// channel ids or the literal "all" (plan §4.1).
import { z } from "zod";
import { getAudit, listChannels, updateAudit } from "../../../../../lib/db";
import { ChannelId } from "../../../../../lib/schemas";
import { runImproveAndLogCrash } from "../../../../../lib/server/runners";

const ImproveBody = z.object({
  channels: z.union([z.literal("all"), z.array(z.string()).min(1, "channels must not be empty")]),
});

const VALID_CHANNEL_IDS = new Set(ChannelId.options);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const audit = getAudit(id);
  if (!audit) {
    return Response.json({ error: `No audit found with id "${id}".` }, { status: 404 });
  }

  if (audit.status !== "scored" && audit.status !== "complete") {
    return Response.json(
      { error: `Audit "${id}" is not ready to improve yet (status "${audit.status}").` },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = ImproveBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }

  const { channels } = parsed.data;

  if (channels !== "all") {
    const unknownIds = channels.filter((c) => !VALID_CHANNEL_IDS.has(c as (typeof ChannelId.options)[number]));
    if (unknownIds.length > 0) {
      return Response.json({ error: `Unknown channel id(s): ${unknownIds.join(", ")}` }, { status: 400 });
    }
    if (channels.includes("promo_video")) {
      return Response.json({ error: `"promo_video" is Coming Soon and cannot be improved.` }, { status: 400 });
    }

    const existingIds = new Set(listChannels(id).map((c) => c.id));
    const missingIds = channels.filter((c) => !existingIds.has(c));
    if (missingIds.length > 0) {
      return Response.json({ error: `Channel id(s) not present on this audit: ${missingIds.join(", ")}` }, { status: 400 });
    }
  }

  // Flip status before responding (mirrors the analyze route, F-042) so a
  // concurrent second request sees "improving" and 409s, not a race.
  updateAudit(id, { status: "improving" });

  // Fire-and-forget: POST must return fast. runImprove re-sets "improving"
  // synchronously on entry (idempotent) and owns every subsequent status
  // transition; this route never awaits it.
  void runImproveAndLogCrash(id, channels);

  return Response.json({ status: "improving" }, { status: 202 });
}
