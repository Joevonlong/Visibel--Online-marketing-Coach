import * as React from "react";

import { cn } from "@/lib/utils";

export type SectionProps = Omit<React.HTMLAttributes<HTMLElement>, "title"> & {
  /** Use the alternate `#F5F5F7` background instead of white. */
  alt?: boolean;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  /** Heading level for `title`. Defaults to `h2` — sections are not the page H1. */
  titleAs?: "h1" | "h2" | "h3";
  description?: React.ReactNode;
  containerClassName?: string;
};

export function Section({
  alt = false,
  eyebrow,
  title,
  titleAs: TitleTag = "h2",
  description,
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  const hasHeader = Boolean(eyebrow || title || description);

  return (
    <section
      className={cn("w-full py-20 sm:py-24 lg:py-32", alt ? "bg-surface-alt" : "bg-surface", className)}
      {...props}
    >
      <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", containerClassName)}>
        {hasHeader && (
          <div className="mb-12 text-center sm:mb-16">
            {eyebrow && (
              <p className="text-[13px] font-semibold tracking-[0.18em] text-ink-secondary uppercase">
                {eyebrow}
              </p>
            )}
            {title && (
              <TitleTag className="mt-2 text-section-title text-ink">{title}</TitleTag>
            )}
            {description && (
              <p className="mx-auto mt-5 max-w-2xl text-body text-ink-secondary">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
