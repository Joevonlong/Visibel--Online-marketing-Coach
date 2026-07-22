"use client";

// F-069 / FEA-111: the top-of-list pitch — "N things stand between you and
// Hero." — plus THE global call to action: one oversized, filled, icon-led
// button that optimizes every unfinished item at once. It is deliberately in a
// different weight class from the small per-row "Improve It" buttons so a
// first-time visitor cannot miss it.
//
// Orchestration (FEA-111): one POST carrying the explicit list of unfinished
// channel ids. The route flips the audit to "improving" before responding, so
// a second concurrent POST would 409 — front-end fan-out is impossible by
// contract, and lib/improve/orchestrate.ts owns the internal concurrency.
// Sending the explicit list (rather than "all") is what lets this component
// know its own target set and report honest "3 of 7" progress and a truthful
// per-item failure summary afterwards.
import * as React from "react";
import { Sparkles } from "lucide-react";

import { Eyebrow } from "../primitives/Eyebrow";
import { PillButton } from "../primitives/PillButton";
import { postImprove } from "./improveApi";
import {
  computeImproveAll,
  improveAllLabel,
  improveAllSummary,
  selectImprovableIds,
} from "./improveAllState";
import { safeUiText } from "../../lib/client/screenshotStatus";
import type { Channel } from "../../lib/schemas";

export type ActionStripProps = {
  auditId: string;
  channels: Channel[];
  /** Audit-level status from the poll response — the authority on whether the
   *  improve engine is still working. */
  auditStatus?: string;
};

export function ActionStrip({ auditId, channels, auditStatus = "scored" }: ActionStripProps) {
  const [requestPending, setRequestPending] = React.useState(false);
  const [targets, setTargets] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const improvableIds = selectImprovableIds(channels);
  const todoCount = improvableIds.length;
  const progress = computeImproveAll({ targets, channels, auditStatus, requestPending });

  const running = progress.phase === "running";
  const failedIds = progress.failedIds;
  // After a partial run the button becomes "retry the ones that failed"; with
  // no run behind us it targets everything still to do.
  const nextTargets = failedIds.length > 0 ? failedIds : improvableIds;
  const label = improveAllLabel(progress, todoCount);
  const summary = improveAllSummary(progress);

  async function handleClick() {
    if (nextTargets.length === 0) return;
    setError(null);
    setTargets(nextTargets);
    setRequestPending(true);
    const result = await postImprove(auditId, nextTargets);
    setRequestPending(false);
    if (!result.ok) {
      // Machine text (route errors carry ids and status codes) — normalize it
      // before it reaches the layout, same rule as ISS-023.
      setError(safeUiText(result.error) ?? "That did not start. Please try again.");
      setTargets(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-6">
      <Eyebrow className="mb-3">Your action list</Eyebrow>
      <div className="flex flex-col items-start justify-between gap-5 border-y border-hairline py-7 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-[19px] font-semibold text-ink">
            {todoCount === 0 && failedIds.length === 0
              ? "Everything here is ready to go."
              : `${todoCount} improvement${todoCount === 1 ? "" : "s"} will make the biggest difference.`}
          </p>
          <p className="mt-1 max-w-md text-[15px] text-ink-secondary">
            {running
              ? "Working through them now — each card below updates as its own result lands."
              : "One click hands the whole list to the experts. You can still do them one at a time below."}
          </p>
          {summary && (
            <p className="mt-2 max-w-md overflow-hidden text-[14px] break-words text-ink-secondary">
              {summary}
            </p>
          )}
          {error && (
            <p className="mt-2 max-w-md overflow-hidden text-sm break-words text-destructive">{error}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          {/* FEA-111: intentionally larger and heavier than every per-row
              button on this page — this is the one thing to click. */}
          <PillButton
            variant="primary"
            size="lg"
            loading={running}
            disabled={nextTargets.length === 0 && !running}
            onClick={handleClick}
            className="h-14 px-8 text-[17px] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)]"
          >
            {/* PillButton wraps children in a plain <span>; keep icon + label
                on one line inside it. */}
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              {!running && <Sparkles className="size-[18px] shrink-0" aria-hidden="true" />}
              {label}
            </span>
          </PillButton>
          {running && progress.total > 0 && (
            <span
              className="text-[13px] text-ink-secondary"
              aria-live="polite"
            >
              {progress.done} of {progress.total} finished
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
