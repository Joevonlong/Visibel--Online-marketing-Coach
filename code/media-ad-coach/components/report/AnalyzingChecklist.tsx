// F-065: calm centered checklist bound to the exact AnalyzeProgressStep
// names (lib/schemas.ts). A step is "complete" once its name appears
// anywhere in progress[]; "current" is the first incomplete step. Unknown
// step names (e.g. a "failed" event — not in the enum, see AGENTS.md
// "Progress steps") are ignored here; audit.status is authoritative and is
// handled by the caller (ReportView), not this component.
import { Check, Loader2 } from "lucide-react";

import { Badge } from "../primitives/Badge";
import type { ProgressEventLike } from "../../lib/client/types";
import { cn } from "@/lib/utils";

const STEPS: { step: string; label: string; note?: string }[] = [
  { step: "reading_site", label: "Reading your site" },
  { step: "collecting_images", label: "Collecting your images" },
  { step: "checking_local_search", label: "Checking local search", note: "Tavily" },
  { step: "recalling_similar_audits", label: "Recalling similar audits" },
  { step: "experts_scoring", label: "Experts scoring" },
  { step: "building_channels", label: "Building your action list" },
  { step: "done", label: "Done" },
];

export type AnalyzingChecklistProps = {
  progress: ProgressEventLike[];
  /** Mode badge — omitted only if execution_mode truly isn't known yet. */
  executionMode?: "LIVE" | "REPLAY";
};

export function AnalyzingChecklist({ progress, executionMode }: AnalyzingChecklistProps) {
  const seen = new Set(progress.map((event) => event.step));
  const firstIncompleteIndex = STEPS.findIndex((s) => !seen.has(s.step));

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-20">
      <div className="text-center">
        {executionMode && (
          <div className="mb-4 flex justify-center">
            <Badge variant={executionMode === "LIVE" ? "live" : "replay"} />
          </div>
        )}
        <h1 className="text-section-title text-ink">Analyzing your business</h1>
        <p className="mt-2 text-body text-ink-secondary">
          This usually takes under a minute.
        </p>
      </div>
      <ol className="w-full space-y-4">
        {STEPS.map((s, index) => {
          const complete = seen.has(s.step);
          const isCurrent = !complete && index === firstIncompleteIndex;

          return (
            <li key={s.step} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  complete
                    ? "bg-success text-success-foreground"
                    : isCurrent
                      ? "bg-accent/15 text-accent"
                      : "bg-surface-alt text-ink-secondary"
                )}
                aria-hidden="true"
              >
                {complete ? (
                  <Check className="size-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cn(
                  "text-[15px]",
                  complete || isCurrent ? "text-ink" : "text-ink-secondary"
                )}
              >
                {s.label}
                {s.note && (
                  <span className="ml-1.5 text-[13px] text-ink-secondary">source: {s.note}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
