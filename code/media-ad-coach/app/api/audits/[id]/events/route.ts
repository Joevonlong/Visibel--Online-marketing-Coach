import { getAudit } from "../../../../../lib/db";
import { createAuditEventStream } from "./stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!getAudit(id)) return Response.json({ error: "Audit not found." }, { status: 404 });

  return new Response(createAuditEventStream(id, request.signal), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
