import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared control chrome for every text-like input in the product. One source
 *  of truth for the paper fill, hairline border and ink focus ring so the
 *  intake form never drifts into default-browser-looking widgets. */
export const fieldControlClass =
  "w-full rounded-xl border border-hairline bg-surface px-4 py-3.5 text-[16px] text-ink placeholder:text-ink-secondary/60 outline-none transition-colors duration-200 ease-out focus:border-ink";

export type FieldLabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Optional leading icon (e.g. a lucide glyph). */
  icon?: React.ReactNode;
  /** Renders a muted "(optional)" suffix after the label text. */
  optional?: boolean;
};

/** The label above a field. Renders a real `<label>` when `htmlFor` is set,
 *  otherwise a `<span>`-styled label for grouped controls (chip groups). */
export function FieldLabel({
  icon,
  optional = false,
  className,
  children,
  htmlFor,
  ...props
}: FieldLabelProps) {
  const content = (
    <>
      {icon}
      <span>
        {children}
        {optional && <span className="ml-1.5 font-normal text-ink-secondary/60">(optional)</span>}
      </span>
    </>
  );
  const classes = cn(
    "mb-2 flex items-center gap-2 text-[14px] font-medium text-ink-secondary",
    className
  );

  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} className={classes} {...props}>
        {content}
      </label>
    );
  }
  return (
    <span className={classes} {...props}>
      {content}
    </span>
  );
}

export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, type = "text", ...props }: TextInputProps) {
  return <input type={type} className={cn(fieldControlClass, className)} {...props} />;
}

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className, rows = 5, ...props }: TextAreaProps) {
  return <textarea rows={rows} className={cn(fieldControlClass, "resize-y", className)} {...props} />;
}
