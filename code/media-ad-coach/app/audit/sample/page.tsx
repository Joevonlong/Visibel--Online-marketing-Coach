// F-060 sample-report entry point ("See a sample report →" on the landing
// page). Reuses the F-080 REPLAY branch: rather than faking a report inline,
// this route finds (or creates) a real REPLAY audit seeded from the fixture
// business and drives it through the same analyze pipeline every other audit
// takes, then hands the visitor off to the normal /audit/[id] report page —
// so a judge sees the real analyzing → scored flow, honestly labeled REPLAY,
// with zero API keys required.
import { redirect } from "next/navigation";

import { createAudit, listAudits, updateAudit } from "@/lib/db";
import fixture from "@/lib/fixtures/replay-audit.json";
import { runAnalyzeAndRecordFailure } from "@/lib/server/runners";

export const dynamic = "force-dynamic";

const RESUMABLE_STATUSES = new Set(["scored", "complete", "analyzing", "improving"]);

export default async function SampleAuditPage() {
  const existing = listAudits().find(
    (audit) => audit.execution_mode === "REPLAY" && RESUMABLE_STATUSES.has(audit.status)
  );

  if (existing) {
    redirect(`/audit/${existing.id}`);
  }

  const audit = createAudit({
    business_json: fixture.business,
    status: "draft",
    execution_mode: "REPLAY",
  });
  updateAudit(audit.id, { status: "analyzing" });
  // Fire-and-forget, same as POST /api/audits/:id/analyze — the redirect
  // below must not wait on the pipeline.
  void runAnalyzeAndRecordFailure(audit.id);

  redirect(`/audit/${audit.id}`);
}
