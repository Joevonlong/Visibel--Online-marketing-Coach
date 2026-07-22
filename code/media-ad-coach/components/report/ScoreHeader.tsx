"use client";

// F-066: giant animated count-up overall score + band + mode badge, plus two
// lane cards (Text / Images) with per-criterion bars against the fixed
// rubric weights — every number here is click-traceable back to
// lib/rubric.ts, never model-invented (AGENTS.md rule #2).
import * as React from "react";

import { Badge } from "../primitives/Badge";
import { CriterionBar } from "../primitives/CriterionBar";
import { PillButton } from "../primitives/PillButton";
import { IMAGE_CRITERIA, TEXT_CRITERIA } from "../../lib/rubric";
import { GRADE_LABEL, GRADE_TEXT_CLASS, gradeOf, type Grade } from "../../lib/client/grade";
import type { Criterion, Report } from "../../lib/schemas";
import { cn } from "@/lib/utils";

const COUNT_UP_MS = 1200;

/** A soft two-stop fill for a graded bar (warm-paper edge -> grade colour). */
function gradeFill(grade: Grade): React.CSSProperties {
  return {
    background: `linear-gradient(90deg, color-mix(in srgb, var(--grade-${grade}) 86%, #fbfaf6), var(--grade-${grade}))`,
  };
}

/** A lane score rendered as a graded bar with a word + number (colourblind-safe). */
function LaneScore({ label, score }: { label: string; score: number }) {
  const grade = gradeOf(score);
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">{label}</h2>
        <span className="flex items-baseline gap-2 text-[14px]">
          <span className={cn("font-semibold", GRADE_TEXT_CLASS[grade])}>{GRADE_LABEL[grade]}</span>
          <span className="text-ink-secondary tabular-nums">{score}/100</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-hairline/60">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, score))}%`, ...gradeFill(grade) }}
        />
      </div>
    </div>
  );
}

function useCountUp(target: number): number {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / COUNT_UP_MS);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => cancelAnimationFrame(raf);
  }, [target]);

  return value;
}

function textScoresById(criteria: readonly Criterion[]): Map<string, number> {
  return new Map(criteria.map((c) => [c.id, c.score]));
}

function imageAveragesById(
  criteriaByAsset: Record<string, readonly Criterion[]>
): Map<string, number> {
  const assetCriteria = Object.values(criteriaByAsset);
  const result = new Map<string, number>();
  for (const def of IMAGE_CRITERIA) {
    const scores: number[] = [];
    for (const criteria of assetCriteria) {
      const match = criteria.find((c) => c.id === def.id);
      if (match) scores.push(match.score);
    }
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    result.set(def.id, Math.round(avg));
  }
  return result;
}

export type ScoreHeaderProps = {
  auditId: string;
  report: Report;
  executionMode: "LIVE" | "REPLAY";
  /** Brand name of the audited business, shown as the report subject. */
  businessName?: string | null;
};

export function ScoreHeader({ auditId, report, executionMode, businessName }: ScoreHeaderProps) {
  const animatedScore = useCountUp(report.overall_score);
  const textScores = textScoresById(report.text.criteria);
  // lib/rubric.ts writes a synthetic "_absent" pseudo-asset (not a real
  // photo) when zero images were scored — that is the "no usable images"
  // case, not a real (if small) image set.
  const imageAssetKeys = Object.keys(report.images.criteria_by_asset);
  const hasImages = !(imageAssetKeys.length === 0 || (imageAssetKeys.length === 1 && imageAssetKeys[0] === "_absent"));
  const imageScores = imageAveragesById(report.images.criteria_by_asset);
  const overallPct = Math.max(0, Math.min(100, report.overall_score));
  const overallGrade = gradeOf(report.overall_score);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-20 text-center sm:py-24">
      <Badge variant={executionMode === "LIVE" ? "live" : "replay"} />
      {businessName && (
        <p className="mt-8 text-[22px] font-semibold tracking-[-0.02em] text-ink">{businessName}</p>
      )}
      <p className={`${businessName ? "mt-2" : "mt-8"} text-[13px] font-medium tracking-[0.16em] text-ink-secondary uppercase`}>
        Visibility score
      </p>
      <div className="mt-2 inline-flex items-end justify-center gap-3 text-ink tabular-nums">
        <span className="text-display font-semibold">{animatedScore}</span>
        <span className="mb-[0.22em] text-2xl font-normal leading-none text-ink-secondary">/100</span>
      </div>
      <p className={cn("mt-2 text-body font-medium", GRADE_TEXT_CLASS[overallGrade])}>{report.band}</p>

      {/* Overall grade on the red -> amber -> green scale. Position + Weak/Fair/
          Strong labels carry the meaning, so it reads without colour too. */}
      <div className="mx-auto mt-6 w-full max-w-md">
        <div
          className="relative h-3 w-full overflow-hidden rounded-full"
          style={{ background: "linear-gradient(90deg, var(--grade-low), var(--grade-mid) 52%, var(--grade-high))" }}
          role="img"
          aria-label={`Overall ${GRADE_LABEL[overallGrade]}: ${report.overall_score} out of 100`}
        >
          <div className="absolute inset-y-0 right-0 bg-surface/80" style={{ left: `${overallPct}%` }} aria-hidden="true" />
          <div
            className="absolute inset-y-[-2px] w-[3px] rounded-full bg-ink"
            style={{ left: `calc(${overallPct}% - 1.5px)` }}
            aria-hidden="true"
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[12px] font-medium text-ink-secondary">
          <span>Weak</span>
          <span>Fair</span>
          <span>Strong</span>
        </div>
      </div>

      <div className="mt-6">
        <PillButton href={`/api/audits/${auditId}/report`} variant="quiet">
          Download PDF report
        </PillButton>
      </div>

      <div className="mt-16 grid gap-10 text-left md:grid-cols-2 md:gap-14">
        <section className="border-t border-hairline pt-7">
          <LaneScore label="Text" score={report.text.score} />
          <div className="space-y-4">
            {TEXT_CRITERIA.map((def) => (
              <CriterionBar
                key={def.id}
                label={def.label}
                score={textScores.get(def.id) ?? 0}
                weight={def.weight}
              />
            ))}
          </div>
        </section>

        <section className="border-t border-hairline pt-7">
          <LaneScore label="Images" score={report.images.score} />
          {!hasImages && (
            <p className="mb-4 text-sm text-ink-secondary">
              No usable images — scored from absence.
            </p>
          )}
          <div className="space-y-4">
            {IMAGE_CRITERIA.map((def) => (
              <CriterionBar
                key={def.id}
                label={def.label}
                score={imageScores.get(def.id) ?? 0}
                weight={def.weight}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
