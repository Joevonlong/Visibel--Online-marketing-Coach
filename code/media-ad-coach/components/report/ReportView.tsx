"use client";

// F-065..F-068 orchestrator: polls the audit, and re-asks the server for
// fresh assets (router.refresh()) whenever status/preview readiness/the set
// of improved channels changes — generated images land in storage_path only
// once the wave-2 improve engine finishes, and this is a server component
// tree above us (app/audit/[id]/page.tsx), so a client-side poll alone would
// never pick up a new asset row.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { ActionStrip } from "./ActionStrip";
import { AnalyzingChecklist } from "./AnalyzingChecklist";
import {
  DiagnosticModules,
  type BeforeScreenshot,
  type GbpEvidenceView,
  type ReportBusiness,
  type WebsiteMeta,
} from "./DiagnosticModules";
import { ContextChips } from "./ContextChips";
import { EvidenceHighlights } from "./EvidenceHighlights";
import { ScoreHeader } from "./ScoreHeader";
import { Badge } from "../primitives/Badge";
import { Eyebrow } from "../primitives/Eyebrow";
import { FadeRise } from "../primitives/FadeRise";
import { Nav } from "../primitives/Nav";
import { PillButton } from "../primitives/PillButton";
import { useAuditPoll } from "../../lib/client/poll";
import { safeUiText } from "../../lib/client/screenshotStatus";
import type { AssetView, AuditPollResponse } from "../../lib/client/types";

export type ReportViewProps = {
  auditId: string;
  initialData: AuditPollResponse;
  assets: AssetView[];
  /** The audited business's brand name, shown as the report subject. */
  businessName?: string | null;
  /** Business + evidence fields powering the FEA-108 diagnostic mockups. */
  business: ReportBusiness;
  websiteMeta: WebsiteMeta;
  /** ISS-024/FEA-101: optional live Google-Maps corroboration slice. */
  gbpEvidence?: GbpEvidenceView;
  beforeScreenshot: BeforeScreenshot;
};

/** ISS-032: the server-rendered tree above us owns the asset rows and their
 *  mtime-stamped URLs, so it must be re-fetched whenever an image MOVES —
 *  which under FEA-112 happens while a channel is still "improving" (a
 *  streamed partial publishes a generated_asset_id and keeps that status).
 *  Keying on improved-channel ids alone missed every partial, and missed the
 *  final frame replacing a partial at the same id. Include each channel's
 *  status AND its currently generated asset. */
function assetSignature(data: AuditPollResponse): string {
  if (!data.channels) return "";
  return data.channels
    .map((c) => {
      const after = c.after as { generated_asset_id?: unknown } | null;
      const generated =
        after && typeof after === "object" && typeof after.generated_asset_id === "string"
          ? after.generated_asset_id
          : "";
      return `${c.id}:${c.status}:${generated}`;
    })
    .sort()
    .join(",");
}

export function ReportView({
  auditId,
  initialData,
  assets,
  businessName,
  business,
  websiteMeta,
  gbpEvidence,
  beforeScreenshot,
}: ReportViewProps) {
  const router = useRouter();
  const { data, error } = useAuditPoll(auditId, initialData);
  const current = data ?? initialData;

  const signatureRef = React.useRef<string>(
    `${initialData.status}|${initialData.preview_ready}|${initialData.images_pending ?? 0}|${assetSignature(initialData)}`
  );

  React.useEffect(() => {
    const signature = `${current.status}|${current.preview_ready}|${current.images_pending ?? 0}|${assetSignature(current)}`;
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      router.refresh();
    }
  }, [current, router]);

  // F-073: sticky "Your new page is ready" bar. Dismissible for the rest of
  // this session only (a plain ref-backed flag, not persisted) — it must
  // reappear on a fresh page load per the "stays dismissed for the session"
  // wording, not forever.
  const [previewBarDismissed, setPreviewBarDismissed] = React.useState(false);
  const showPreviewBar = current.preview_ready && !previewBarDismissed;

  return (
    <div className="min-h-screen bg-surface">
      <Nav wordmark="Visibel" href="/">
        <Link href="/audit/new" className="text-sm text-ink-secondary hover:text-ink">
          New audit
        </Link>
        <Link href="/history" className="text-sm text-ink-secondary hover:text-ink">
          History
        </Link>
      </Nav>

      {/* ISS-023: poll/pipeline strings are machine text — normalize + wrap. */}
      {error && (
        <p className="mx-auto max-w-5xl overflow-hidden px-6 pt-4 text-sm break-words text-ink-secondary">
          {safeUiText(error)}
        </p>
      )}

      {(current.status === "draft" || current.status === "analyzing") && (
        <AnalyzingChecklist progress={current.progress} executionMode={current.execution_mode} />
      )}

      {current.status === "failed" && (
        <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-20 text-center">
          <Badge variant={current.execution_mode === "LIVE" ? "live" : "replay"} />
          <h1 className="text-section-title text-ink">This audit failed</h1>
          <p className="w-full overflow-hidden text-body break-words text-ink-secondary">
            {(current.progress.length > 0
              ? safeUiText(current.progress[current.progress.length - 1].detail)
              : null) ?? "The pipeline stopped before finishing. Nothing was faked in its place."}
          </p>
          <PillButton href="/audit/new" variant="primary">
            Start over
          </PillButton>
        </div>
      )}

      {(current.status === "scored" || current.status === "improving" || current.status === "complete") &&
        current.report && (
          <>
            <FadeRise>
              <ScoreHeader
                auditId={auditId}
                report={current.report}
                executionMode={current.execution_mode}
                businessName={businessName}
              />
            </FadeRise>
            {current.report.executive_summary && (
              <FadeRise delay={0.03}>
                <section className="mx-auto w-full max-w-5xl px-6">
                  <div className="border-t border-hairline py-10 sm:py-12">
                    <Eyebrow>Summary</Eyebrow>
                    <p className="mt-4 max-w-3xl text-[19px] leading-[1.6] text-ink">
                      {current.report.executive_summary}
                    </p>
                  </div>
                </section>
              </FadeRise>
            )}
            <FadeRise delay={0.05}>
              <ContextChips report={current.report} />
            </FadeRise>
            <FadeRise delay={0.1}>
              <EvidenceHighlights report={current.report} assets={assets} />
            </FadeRise>
            {/* CHANNEL_LIST_SLOT — F-069..F-072 / FEA-108 diagnostic modules */}
            {current.channels && current.channels.length > 0 && (
              <FadeRise delay={0.15}>
                <ActionStrip
                  auditId={auditId}
                  channels={current.channels}
                  auditStatus={current.status}
                />
                <DiagnosticModules
                  auditId={auditId}
                  channels={current.channels}
                  assets={assets}
                  report={current.report}
                  business={business}
                  websiteMeta={websiteMeta}
                  gbpEvidence={gbpEvidence}
                  beforeScreenshot={beforeScreenshot}
                  executionMode={current.execution_mode}
                />
              </FadeRise>
            )}
          </>
        )}

      {/* F-073: sticky "Your new page is ready" bar */}
      <AnimatePresence>
        {showPreviewBar && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-surface/90 backdrop-blur-md backdrop-saturate-150"
          >
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
              <p className="text-[15px] font-medium text-ink">Your new page is ready.</p>
              <div className="flex items-center gap-3">
                <PillButton href={`/audit/${auditId}/preview`} variant="primary">
                  See Before / After
                </PillButton>
                <button
                  type="button"
                  onClick={() => setPreviewBarDismissed(true)}
                  aria-label="Dismiss"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors duration-200 ease-out hover:bg-surface-alt hover:text-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
