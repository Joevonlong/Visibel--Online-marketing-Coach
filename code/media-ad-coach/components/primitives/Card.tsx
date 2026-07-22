import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-[1.25rem] p-5 sm:p-6", {
  variants: {
    variant: {
      /** Flat #F5F5F7 fill — sits flush against alt-background sections. */
      filled: "bg-surface-alt",
      /** Paper fill with a quiet rule; depth comes from hierarchy, not glow. */
      outlined: "bg-surface border border-hairline",
    },
  },
  defaultVariants: {
    variant: "filled",
  },
});

export type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({ variant, className, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}
