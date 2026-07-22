// FEA-116: the business's own name is the one thing a visitor must never have
// to hunt for on the generated site. It leads the hero, sits in the header on
// every page, and closes the footer.
//
// The hard part is that we do not control the string. German trade names
// run from "Rohrfuchs" to "M. Mustermann Sanitär- und Heizungstechnik GmbH & Co.
// KG", and the After page is often rendered into a ~50%-wide split pane. A
// single fixed size would either look timid for a short name or break the
// layout for a long one, so the hero size is chosen from the name's length.
//
// Pure module — no React — so the sizing rule is testable without a DOM.

/** Longest name that still gets the full display treatment. */
const SHORT_NAME_MAX = 18;
/** Above this, drop another step rather than letting it wrap three times. */
const MEDIUM_NAME_MAX = 34;

/**
 * Tailwind SIZE class for the hero wordmark, scaled to the name's length.
 *
 * Returns the size only. Callers must pass it to `cn()` BEFORE any
 * `leading-*` class: tailwind-merge treats `text-[clamp(...)]` as the
 * font-size/line-height shorthand and drops a line-height that precedes it.
 * Every tier keeps `clamp()` (so it also responds to the viewport) plus
 * break-word + hyphens, because a single unbreakable compound is the one thing
 * that can still overflow.
 */
export function heroBrandNameClass(name: string): string {
  const length = name.trim().length;
  if (length <= SHORT_NAME_MAX) return "text-[clamp(2.5rem,7vw,4.5rem)]";
  if (length <= MEDIUM_NAME_MAX) return "text-[clamp(2rem,5.5vw,3.5rem)]";
  return "text-[clamp(1.75rem,4.5vw,2.75rem)]";
}

/** The name to show, or null when the audit genuinely has none — the template
 *  must never print a placeholder like "Your business" as if it were real. */
export function resolveBrandName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}
