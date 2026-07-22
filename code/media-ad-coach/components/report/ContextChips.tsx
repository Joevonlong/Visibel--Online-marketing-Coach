"use client";

// F-067: findability / platform coverage / reputation / memory chips.
// Truth discipline (AGENTS.md #3): the Tavily "error" state must read as an
// honest failure, not a masked "not found" — and every judgment sitting on
// top of it is labeled ASSUMPTION. Reputation chips are explicitly marked
// "context only — not scored" (they never feed the rubric, per §2.1).
import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "../primitives/Badge";
import { Eyebrow } from "../primitives/Eyebrow";
import type { Report } from "../../lib/schemas";
import { cn } from "@/lib/utils";

const FINDABILITY_LABEL: Record<Report["findability"]["status"], string> = {
  found: "Found on Google",
  portals_only: "Portals only",
  not_found: "Not found",
  error: "Search check failed",
};

function ChipShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-t border-hairline py-4", className)}>{children}</div>
  );
}

function FindabilityChip({ findability }: { findability: Report["findability"] }) {
  const [open, setOpen] = React.useState(false);
  const isError = findability.status === "error";

  return (
    <ChipShell>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[15px] text-ink">
          {FINDABILITY_LABEL[findability.status]}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-secondary transition-transform duration-200 ease-out", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {isError && (
        <p className="mt-1 text-[13px] text-ink-secondary">
          Judgments below are labeled <span className="font-medium">ASSUMPTION</span>.
        </p>
      )}
      <p className="mt-1 text-[13px] text-ink-secondary">Tavily source</p>
      {open && (
        <ul className="mt-3 space-y-2 border-t border-hairline pt-3">
          {findability.results.length === 0 ? (
            <li className="text-[13px] text-ink-secondary">No results recorded.</li>
          ) : (
            findability.results.map((result) => (
              <li key={result.url} className="text-sm">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent hover:underline"
                >
                  {result.title}
                </a>
              </li>
            ))
          )}
        </ul>
      )}
    </ChipShell>
  );
}

function PlatformCoverageChip({ coverage }: { coverage: Report["presence_coverage"] }) {
  const present = [
    coverage.website && "website",
    coverage.maps && "maps",
    coverage.yellow_pages && "yellow pages",
  ].filter(Boolean) as string[];

  const napVerdict =
    coverage.nap_consistent === null
      ? null
      : coverage.nap_consistent
        ? "consistent across platforms"
        : "inconsistent — see Platform consistency below";

  return (
    <ChipShell>
      <p className="text-[15px] text-ink">
        {present.length > 0 ? present.join(", ") : "No listings found"}
        {coverage.other_count > 0 && ` +${coverage.other_count} more`}
      </p>
      {napVerdict && <p className="mt-1 text-[13px] text-ink-secondary">{napVerdict}</p>}
    </ChipShell>
  );
}

function ReputationChips({ chips }: { chips: NonNullable<Report["reputation_chips"]> }) {
  return (
    <ChipShell>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink">
        {chips.review_count !== null && <span>{chips.review_count} reviews</span>}
        {chips.rating !== null && <span>{chips.rating.toFixed(1)}★</span>}
        {chips.has_photo_reviews !== null && (
          <span>{chips.has_photo_reviews ? "has photo reviews" : "no photo reviews"}</span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-secondary">Context only — not scored</p>
    </ChipShell>
  );
}

function MemoryChip({ memoryNote }: { memoryNote: NonNullable<Report["memory_note"]> }) {
  return (
    <ChipShell className="flex items-center justify-between gap-3">
      <p className="text-[15px] text-ink">{memoryNote.text}</p>
      <Badge variant="neutral">memory: Cognee</Badge>
    </ChipShell>
  );
}

export type ContextChipsProps = {
  report: Report;
};

export function ContextChips({ report }: ContextChipsProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-8">
      <Eyebrow>Where you stand online</Eyebrow>
      <div className="mt-3 grid gap-x-10 md:grid-cols-2">
        <FindabilityChip findability={report.findability} />
        <PlatformCoverageChip coverage={report.presence_coverage} />
        {report.reputation_chips && <ReputationChips chips={report.reputation_chips} />}
        {report.memory_note && <MemoryChip memoryNote={report.memory_note} />}
      </div>
    </section>
  );
}
