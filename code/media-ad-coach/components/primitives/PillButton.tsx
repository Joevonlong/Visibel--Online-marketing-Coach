import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const pillButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap outline-none transition-[background-color,color,transform] duration-200 ease-out select-none focus-visible:ring-2 focus-visible:ring-ink/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ink text-surface hover:bg-ink/85",
        quiet: "border border-hairline bg-transparent text-ink hover:bg-surface-alt",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      size: {
        md: "h-11 px-5 text-[15px]",
        lg: "h-12 px-7 text-[16px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type PillButtonOwnProps = VariantProps<typeof pillButtonVariants> & {
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

type PillButtonAsButtonProps = PillButtonOwnProps &
  Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children" | "disabled"
  > & {
    href?: undefined;
  };

type PillButtonAsAnchorProps = PillButtonOwnProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string;
  };

/** Renders a `<button>` by default, or an `<a>` when `href` is provided. */
export type PillButtonProps = PillButtonAsButtonProps | PillButtonAsAnchorProps;

export function PillButton({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  href,
  ...props
}: PillButtonProps) {
  const isDisabled = disabled || loading;
  const classes = cn(
    pillButtonVariants({ variant, size }),
    loading && "cursor-wait",
    className
  );

  const content = (
    <>
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      )}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={isDisabled ? undefined : href}
        aria-disabled={isDisabled || undefined}
        className={classes}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={classes}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
}
