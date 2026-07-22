// Fire-and-forget runners started (but never awaited) by the API routes.
// They live here rather than in the route files because a Next.js route
// module may only export HTTP handlers in a production build; tests import
// these directly to await the exact promise a POST starts.
import { addProgressEvent, updateAudit } from "../db";
import { runAnalyzePipeline } from "../pipeline/orchestrator";
import { runImprove } from "../improve/orchestrate";

/** Runs the analyze pipeline and records an honest failure if it rejects.
 *  POST /api/audits/:id/analyze starts this without awaiting it. */
export async function runAnalyzeAndRecordFailure(auditId: string): Promise<void> {
  try {
    await runAnalyzePipeline(auditId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`analyze pipeline failed for audit ${auditId}: ${message}`);
    updateAudit(auditId, { status: "failed" });
    // "failed" is not an AnalyzeProgressStep enum value — audits.status is the
    // authoritative failure signal; pollers ignore unrecognized steps (AGENTS.md).
    addProgressEvent(auditId, "failed", message);
  }
}

/** Runs the improve engine; orchestrate.ts already handles every documented
 *  failure mode honestly, so this only guards an unexpected crash.
 *  POST /api/audits/:id/improve starts this without awaiting it. */
export async function runImproveAndLogCrash(auditId: string, channels: string[] | "all"): Promise<void> {
  try {
    await runImprove(auditId, channels);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`improve run crashed unexpectedly for audit ${auditId}: ${message}`);
  }
}
