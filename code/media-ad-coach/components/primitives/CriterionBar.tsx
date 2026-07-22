import * as React from "react";

import { GRADE_LABEL, GRADE_TEXT_CLASS, gradeOf } from "../../lib/client/grade";
import { cn } from "@/lib/utils";

export type CriterionBarProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  label: string;
  /** 0-5 sub-score, per the T1-T8 / I1-I6 rubric (lib/rubric.ts). */
  score: number;
  /** Criterion weight as a percentage, e.g. `20` for 20%. */
  weight: number;
  maxScore?: number;
};

export function CriterionBar({
  label,
  score,
  weight,
  maxScore = 5,
  className,
  ...props
}: CriterionBarProps) {
  const clamped = Math.max(0, Math.min(score, maxScore));
  const percent = maxScore > 0 ? (clamped / maxScore) * 100 : 0;
  const grade = gradeOf(percent);

  return (
    <div className={cn("w-full", className)} {...props}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-ink">{label}</span>
        {/* Word + number so the grade never relies on colour alone. */}
        <span className="flex shrink-0 items-baseline gap-2 text-[13px]">
          <span className={cn("font-semibold", GRADE_TEXT_CLASS[grade])}>{GRADE_LABEL[grade]}</span>
          <span className="text-ink-secondary tabular-nums">
            {clamped}/{maxScore} · {weight}%
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={maxScore}
        aria-label={`${label}: ${GRADE_LABEL[grade]}`}
        className="h-2 w-full overflow-hidden rounded-full bg-hairline/60"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, var(--grade-${grade}) 86%, #fbfaf6), var(--grade-${grade}))`,
          }}
        />
      </div>
    </div>
  );
}
