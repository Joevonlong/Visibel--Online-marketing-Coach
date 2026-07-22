// ISS-023: the ONLY place that turns a failed `evidence_json.before_screenshot`
// record into judge-visible text. `lib/pipeline/screenshot.ts` stores the raw
// exception message in `detail` (e.g. a Playwright launch error carrying local
// filesystem paths, box-drawing characters and an `npx playwright install`
// instruction). That string is diagnostics — it belongs in the server log, never
// in the UI, where it also overflowed the card horizontally.
//
// Rule: UI copy is chosen from a fixed allowlist keyed by the machine-readable
// `reason`. No part of the raw detail is ever concatenated into the output.
// Pure functions, no imports — usable from server pages and client components.

export type ScreenshotFailureReason =
  | "unsafe_url"
  | "playwright_unavailable"
  | "browser_unavailable"
  | "timeout"
  | "capture_failed";

/** Short, neutral, user-meaningful copy. No paths, no commands, no stack text. */
const FAILURE_COPY: Record<ScreenshotFailureReason, string> = {
  unsafe_url: "That web address could not be opened safely, so no live capture was taken.",
  playwright_unavailable: "Live capture was not available for this audit.",
  browser_unavailable: "Live capture was not available for this audit.",
  timeout: "The site took too long to load, so the live capture timed out.",
  capture_failed: "The live capture did not finish for this site.",
};

const GENERIC_COPY = "No live capture was taken for this site.";

/** Headline shown on the placeholder tile. */
export const SCREENSHOT_UNAVAILABLE_TITLE = "Screenshot unavailable";

function isFailureReason(value: unknown): value is ScreenshotFailureReason {
  return typeof value === "string" && value in FAILURE_COPY;
}

/**
 * Maps a `before_screenshot` failure record to safe UI copy.
 * `reason` decides the message; `detail` is deliberately ignored.
 */
export function screenshotFailureCopy(record: unknown): string {
  if (!record || typeof record !== "object") return GENERIC_COPY;
  const reason = (record as { reason?: unknown }).reason;
  return isFailureReason(reason) ? FAILURE_COPY[reason] : GENERIC_COPY;
}

/**
 * Raw diagnostics for the server log only (never returned to the browser).
 * Kept next to the copy mapper so the pairing stays obvious at call sites.
 */
export function screenshotFailureDiagnostics(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const detail = (record as { detail?: unknown }).detail;
  return typeof detail === "string" && detail.trim().length > 0 ? detail : null;
}

const MAX_UI_TEXT_LENGTH = 180;

/**
 * Defensive last line of defence for ANY string that might carry machine
 * error text into the UI (improve-API failures, pipeline progress details…):
 * collapses control/box-drawing characters and whitespace to single spaces and
 * hard-truncates, so no unbreakable blob can ever blow up a layout.
 * Pair it with `break-words` on the rendering element.
 */
export function safeUiText(value: unknown, maxLength: number = MAX_UI_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value
    // control chars + box-drawing/blocks used by CLI banners
    .replace(/[\u0000-\u001f\u007f\u2500-\u259f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length === 0) return null;
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…` : collapsed;
}
