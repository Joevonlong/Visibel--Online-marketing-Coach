import * as React from "react";

import { cn } from "@/lib/utils";

export type NavProps = Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  wordmark?: React.ReactNode;
  /** Where the wordmark links to. Defaults to the landing page. */
  href?: string;
  /** Right-hand slot — CTA, links, mode badge, etc. */
  children?: React.ReactNode;
};

export function Nav({
  wordmark = "Visibel",
  href = "/",
  className,
  children,
  ...props
}: NavProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-hairline bg-surface/92 backdrop-blur-xl",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href={href} className="text-[16px] font-semibold tracking-[-0.03em] text-ink">
          {wordmark}
        </a>
        <div className="flex items-center gap-4">{children}</div>
      </div>
    </header>
  );
}
