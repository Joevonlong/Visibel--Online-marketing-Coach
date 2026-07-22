import * as React from "react";

import { cn } from "@/lib/utils";

export type Severity = "high" | "medium" | "low";

export type SeverityDotProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
  severity: Severity;
  /** Show the severity word next to the dot instead of hiding it (`sr-only`). */
  label?: boolean;
};

const severityDotStyles: Record<Severity, string> = {
  high: "bg-destructive",
  medium: "bg-[#9a6b32]",
  low: "bg-ink-secondary/50",
};

const severityLabels: Record<Severity, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

export function SeverityDot({ severity, label = false, className, ...props }: SeverityDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", severityDotStyles[severity], className)}
        {...props}
      />
      <span className={label ? "text-[13px] text-ink-secondary" : "sr-only"}>
        {severityLabels[severity]}
      </span>
    </span>
  );
}
