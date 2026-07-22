import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const chipBaseClass =
  "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[14px] font-medium transition-colors duration-200 ease-out select-none";

const chipSelectedClass = "border-ink bg-ink text-surface";
const chipRestClass =
  "border-hairline bg-surface text-ink-secondary hover:border-ink hover:text-ink";

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Filled ink treatment when true; outlined otherwise. Drives `aria-pressed`. */
  selected?: boolean;
  children: React.ReactNode;
};

/** A single selectable pill — the one-tap toggle used for trade / business-type
 *  quick-picks. Matches the landing and Before/After pill aesthetic exactly. */
export function Chip({ selected = false, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(chipBaseClass, selected ? chipSelectedClass : chipRestClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export type RemovableChipProps = {
  /** Label text for the entry. */
  children: React.ReactNode;
  onRemove: () => void;
  /** Accessible label for the remove control, e.g. `Remove "Bakery"`. */
  removeLabel?: string;
  className?: string;
};

/** A committed value shown as a filled pill with a trailing remove control —
 *  used for free-text custom entries the user has added. Not a `<button>`
 *  itself (that would nest the remove button illegally); the X is the only
 *  interactive element. */
export function RemovableChip({
  children,
  onRemove,
  removeLabel,
  className,
}: RemovableChipProps) {
  return (
    <span className={cn(chipBaseClass, chipSelectedClass, "pr-2.5", className)}>
      <span>{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? "Remove"}
        className="flex size-5 items-center justify-center rounded-full text-surface/70 transition-colors duration-200 ease-out hover:bg-surface/20 hover:text-surface"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}
