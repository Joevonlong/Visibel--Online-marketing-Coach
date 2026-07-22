// ISS-033 / FEA-114: a quiet label saying WHAT a picture shows
// ("Work result", "Team", …). Deliberately lower-contrast than the truth
// badges it sits beside — "AI concept" / "Your current photo" answer *where an
// image came from*, which the visitor must not miss; this only answers *what
// it depicts*, so it must never compete with them.
import * as React from "react";

import { cn } from "@/lib/utils";

export function CategoryChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium tracking-[0.01em] text-ink-secondary",
        className
      )}
    >
      {label}
    </span>
  );
}
