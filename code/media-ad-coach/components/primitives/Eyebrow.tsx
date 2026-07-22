import * as React from "react";

import { cn } from "@/lib/utils";

/** The small uppercase, letter-spaced label that sits above a heading across
 *  the product (landing hero, form sections, report sections). Centralized so
 *  every eyebrow shares one exact treatment instead of re-declaring the
 *  tracking/size/colour inline. */
export type EyebrowProps = React.HTMLAttributes<HTMLParagraphElement>;

export function Eyebrow({ className, ...props }: EyebrowProps) {
  return (
    <p
      className={cn(
        "text-[13px] font-semibold tracking-[0.18em] text-ink-secondary uppercase",
        className
      )}
      {...props}
    />
  );
}
