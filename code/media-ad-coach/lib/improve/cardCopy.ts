/**
 * ISS-036 — bounded, presentable copy for the optimized page's cards.
 *
 * The defect: the "Get in touch" services card rendered 641 characters of the
 * customer's own scraped homepage, led by the internal string
 * `"Business type: Plumber."` that `components/input/GeneralInfoSection.tsx`
 * composes for the FORM, not for display. Preview assembly used
 * `business.background` verbatim as a fallback, so raw site text became card
 * copy and the layout broke.
 *
 * Two rules, applied to every path — model output and fallback alike:
 *   1. Internal scaffolding never reaches the page.
 *   2. Card copy is bounded, and truncation happens at a sentence boundary so
 *      a shortened card still reads like a sentence rather than a cut-off.
 *
 * Pure and exported so preview assembly and its tests share one definition.
 */

/** A marketing card's headline. Long enough for "Heizungsmodernisierung in
 *  Berlin", short enough that it never wraps to three lines. */
export const CARD_TITLE_MAX = 40;
/** Card body. ~2 short sentences — the length a visitor actually reads. */
export const CARD_BODY_MAX = 180;
/** Hero subline: one confident line under the headline. */
export const HERO_SUBLINE_MAX = 180;
/** The About paragraph is allowed to be a paragraph, but not a page. */
export const ABOUT_TEXT_MAX = 600;

/** Internal scaffolding that must never be shown: the form's composed
 *  "Business type: …" prefix (ISS-036), and the section labels the extractor
 *  prepends to scraped blocks. */
const INTERNAL_PREFIXES = [
  /^\s*business type\s*:\s*[^.]*\.\s*/i,
  /^\s*(gesch[äa]ftsart|branche)\s*:\s*[^.]*\.\s*/i,
  /^\s*(hero|about|services|footer|contact)\s*:\s*/i,
];

/** Strips internal prefixes and normalizes the whitespace that scraped text
 *  arrives with (runs of spaces, hard line breaks, non-breaking spaces). */
export function stripInternalScaffolding(text: string): string {
  let out = text.replace(/ /g, " ");
  for (const prefix of INTERNAL_PREFIXES) out = out.replace(prefix, "");
  return out.replace(/\s+/g, " ").trim();
}

/** True when a string still looks like a scraped document rather than card
 *  copy — several sentences, ALL-CAPS headings, or list scaffolding. Used to
 *  decide whether a fallback may be shown at all. */
export function looksLikeRawDocument(text: string): boolean {
  const normalized = stripInternalScaffolding(text);
  if (normalized.length > CARD_BODY_MAX * 2) return true;
  if (/\b[A-ZÄÖÜ]{6,}\b/.test(normalized)) return true; // "HEIZUNGSTECHNIK"
  return false;
}

/** Abbreviations and initials that end in a period WITHOUT ending a sentence.
 *  Splitting on them produced "…bieten wir als M." on the real page — a
 *  sentence cut in half at the owner's initial. German + English business
 *  vocabulary, plus any single letter (an initial). */
const NON_TERMINAL_ABBREVIATION = /(^|\s)([A-Za-zÄÖÜäöü]|dr|prof|nr|str|bzw|ca|evtl|inkl|zzgl|u|z|d|st|mr|mrs|ms|inc|ltd|co|vs|etc|approx)$/i;

/** Index just past the last sentence-ending punctuation at or before `limit`,
 *  or -1. Skips abbreviations and initials, so a sentence is only "ended" by a
 *  period that really ends one. */
export function lastSentenceEnd(text: string, limit: number): number {
  let found = -1;
  const pattern = /[.!?](?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + 1;
    if (end > limit) break;
    const preceding = text.slice(0, match.index);
    if (NON_TERMINAL_ABBREVIATION.test(preceding)) continue;
    found = end;
  }
  return found;
}

/** Truncates at the last sentence end within `max`, else at the last word
 *  boundary, appending an ellipsis only when text was actually dropped. Never
 *  returns a mid-word fragment. */
export function boundText(text: string, max: number): string {
  const normalized = stripInternalScaffolding(text);
  if (normalized.length <= max) return normalized;

  const lastSentence = lastSentenceEnd(normalized, max);
  if (lastSentence >= Math.floor(max * 0.4)) return normalized.slice(0, lastSentence).trim();

  // The ellipsis counts toward the limit — a "bounded" string that is max + 1
  // characters long is not bounded.
  const room = normalized.slice(0, Math.max(1, max - 1));
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(max * 0.4) ? room.slice(0, lastSpace) : room;
  return `${cut.trim().replace(/[,;:–-]$/, "")}…`;
}

export function boundCardTitle(text: string): string {
  return boundText(text, CARD_TITLE_MAX);
}

export function boundCardBody(text: string): string {
  return boundText(text, CARD_BODY_MAX);
}

/** A fallback body derived from the business's own free text: shown only when
 *  it reads like copy, never when it is still a scraped document. Returns
 *  `null` when there is nothing presentable, so the caller uses its own
 *  honest generic line instead of publishing a wall of text. */
export function usableFallbackBody(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const normalized = stripInternalScaffolding(text);
  if (normalized.length === 0) return null;
  if (looksLikeRawDocument(normalized)) {
    // Salvage just the opening sentence when it is self-contained; otherwise
    // give up rather than publish an excerpt of a wall of text.
    const end = lastSentenceEnd(normalized, CARD_BODY_MAX);
    const firstSentence = end >= 20 ? normalized.slice(0, end).trim() : null;
    return firstSentence && !/\b[A-ZÄÖÜ]{6,}\b/.test(firstSentence) ? firstSentence : null;
  }
  return boundCardBody(normalized);
}
