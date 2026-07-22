// FEA-111: the arithmetic behind the global "Do It All For You" button, kept
// pure so it is testable without a DOM (this repo's vitest setup is node-only)
// and so the honesty rule lives in one place: progress and the closing summary
// are derived from real channel state, never from a timer or an optimistic
// guess.
//
// Truth model (matches lib/improve/orchestrate.ts):
//   todo      — not improved. During a run: still queued or being worked on.
//               After the run ends: the engine tried and failed, and put it
//               back. That is what "failed" means here — nothing else reports it.
//   improving — the engine is on it right now.
//   improved  — done.
//   coming_soon — never a target (promo_video is out of scope by decision).

import type { Channel } from "../../lib/schemas";

/** Channels the global button may act on: everything still to do, minus the
 *  deliberately disabled "Coming soon" rows. */
export function selectImprovableIds(channels: Channel[]): string[] {
  return channels
    .filter((channel) => channel.status === "todo" && channel.id !== "promo_video")
    .map((channel) => channel.id);
}

export type ImproveAllPhase = "idle" | "running" | "summary";

export type ImproveAllProgress = {
  phase: ImproveAllPhase;
  /** Size of the batch the user actually launched. */
  total: number;
  done: number;
  /** Only meaningful once the run has settled. */
  failedIds: string[];
};

export type ImproveAllInput = {
  /** The ids this UI launched, or null when no run was started from here. */
  targets: string[] | null;
  channels: Channel[];
  /** Audit-level status from the poll response. */
  auditStatus: string;
  /** True between the click and the first poll tick that reflects it, so the
   *  button never flickers back to idle while the request is in flight. */
  requestPending: boolean;
};

export function computeImproveAll({
  targets,
  channels,
  auditStatus,
  requestPending,
}: ImproveAllInput): ImproveAllProgress {
  if (!targets || targets.length === 0) {
    return { phase: "idle", total: 0, done: 0, failedIds: [] };
  }

  const byId = new Map<string, Channel>(channels.map((channel) => [channel.id, channel]));
  const done = targets.filter((id) => byId.get(id)?.status === "improved").length;

  // The run is live while the request is in flight, while the audit says
  // "improving", or while any target is still visibly being worked on.
  const engineBusy =
    requestPending ||
    auditStatus === "improving" ||
    targets.some((id) => byId.get(id)?.status === "improving");

  if (engineBusy) {
    return { phase: "running", total: targets.length, done, failedIds: [] };
  }

  // Settled: anything the engine did not finish is a genuine failure — the
  // orchestrator resets a channel it could not improve back to "todo".
  const failedIds = targets.filter((id) => byId.get(id)?.status !== "improved");
  return { phase: "summary", total: targets.length, done, failedIds };
}

/** Button label. Never claims progress it cannot prove. */
export function improveAllLabel(progress: ImproveAllProgress, improvableCount: number): string {
  if (progress.phase === "running") {
    return `Optimizing… ${progress.done} of ${progress.total} done`;
  }
  if (progress.phase === "summary" && progress.failedIds.length > 0) {
    return `Retry ${progress.failedIds.length} unfinished`;
  }
  if (improvableCount === 0) return "Everything is optimized";
  return "Do It All For You";
}

/** Closing sentence under the button. Returns null while nothing to report. */
export function improveAllSummary(progress: ImproveAllProgress): string | null {
  if (progress.phase !== "summary") return null;
  const { done, failedIds } = progress;
  if (failedIds.length === 0) {
    return done === 1 ? "That improvement is done." : `All ${done} improvements are done.`;
  }
  return `${done} done · ${failedIds.length} could not be finished. Nothing was faked in their place — retry them below.`;
}
