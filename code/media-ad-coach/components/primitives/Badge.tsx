import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold tracking-[0.04em] whitespace-nowrap",
  {
    variants: {
      variant: {
        /** Truthful "this ran live" mode badge. */
        live: "bg-success/15 text-success",
        /** Truthful "this is fixture data" mode badge. */
        replay: "bg-ink-secondary/15 text-ink-secondary",
        /** The non-negotiable truth-label badge for generated imagery (§4.3). */
        ai_concept: "bg-ink/90 text-surface",
        /** gpt-image-2 edit of a real photo (P1). */
        enhanced: "bg-success/15 text-success",
        neutral: "bg-surface-alt text-ink-secondary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

const badgeDefaultLabel: Record<
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>,
  string
> = {
  live: "LIVE",
  replay: "REPLAY SAMPLE",
  ai_concept: "AI concept",
  enhanced: "Enhanced",
  neutral: "",
};

export type BadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> &
  VariantProps<typeof badgeVariants> & {
    children?: React.ReactNode;
    /**
     * Position as an absolute top-right corner overlay with a backdrop blur
     * — the way `ai_concept` sits on generated images (§4.3).
     * The parent element needs `position: relative`.
     */
    overlay?: boolean;
  };

export function Badge({
  variant = "neutral",
  overlay = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        badgeVariants({ variant }),
        overlay && "absolute top-3 right-3 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      {children ?? (variant ? badgeDefaultLabel[variant] : null)}
    </span>
  );
}
