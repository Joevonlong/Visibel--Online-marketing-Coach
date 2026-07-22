// ISS-030: the ONLY place a failed image generation / image edit turns into
// judge-visible text. Same rule as lib/client/screenshotStatus.ts (ISS-023):
// UI copy comes from a fixed allowlist; the raw machine string is diagnostics
// and belongs in the console, never on the page.
//
// The strings we are protecting against are written by
// lib/improve/orchestrate.ts and lib/improve/image.ts, e.g.
//   "Image generation failed: 429 Rate limit reached for images..."
//   "Image generation failed: Request timed out after 120000ms"
//   "Image edit failed: <provider SDK message>"
// They carry provider internals, numeric timeouts and occasionally URLs. They
// were being interpolated straight into a sentence in BeforeAfterInline.
//
// Difference from screenshotStatus: that record carries a machine-readable
// `reason` field to key on. These carry only free text from a provider SDK, so
// classification is necessarily a heuristic over that text — which is safe
// ONLY because every branch, including the default, returns allowlisted copy.
// No part of the input is ever concatenated into the output.

export type GenerationFailureKind =
  | "timeout"
  | "rate_limited"
  | "content_policy"
  | "auth"
  | "unknown";

/** Short, neutral, user-meaningful. No provider names, no numbers, no paths. */
const GENERATION_COPY: Record<GenerationFailureKind, string> = {
  timeout: "This image took too long to generate and was stopped. You can try it again.",
  rate_limited: "Too many image requests at once — this one didn't get through. Try it again in a moment.",
  content_policy: "This image couldn't be generated from the current brief. Adjusting the description usually helps.",
  auth: "Image generation isn't available right now.",
  unknown: "This image couldn't be generated this time — you can retry it.",
};

const EDIT_COPY: Record<GenerationFailureKind, string> = {
  timeout: "Editing this photo took too long and was stopped. Your original is untouched — you can try again.",
  rate_limited: "Too many image requests at once — this edit didn't get through. Your original is untouched.",
  content_policy: "This photo couldn't be edited automatically. Your original is untouched.",
  auth: "Photo editing isn't available right now. Your original is untouched.",
  unknown: "This photo couldn't be edited this time — your original is untouched, and you can retry.",
};

const KINDS = new Set<string>(["timeout", "rate_limited", "content_policy", "auth", "unknown"]);

/** Heuristic over an uncontrolled provider string. Unmatched → "unknown",
 *  which still yields allowlisted copy. Also accepts an already-classified
 *  kind token, so the server can redact before serializing (see
 *  `redactGenerationError`) and the client can still pick the right copy. */
export function classifyGenerationFailure(raw: unknown): GenerationFailureKind {
  if (typeof raw !== "string") return "unknown";
  if (KINDS.has(raw)) return raw as GenerationFailureKind;
  const text = raw.toLowerCase();
  if (text.includes("timed out") || text.includes("timeout") || text.includes("etimedout")) return "timeout";
  if (text.includes("rate limit") || text.includes("429") || text.includes("too many requests")) {
    return "rate_limited";
  }
  if (
    text.includes("content policy") ||
    text.includes("safety") ||
    text.includes("moderation") ||
    text.includes("rejected")
  ) {
    return "content_policy";
  }
  if (
    text.includes("api key") ||
    text.includes("unauthorized") ||
    text.includes("401") ||
    text.includes("403")
  ) {
    return "auth";
  }
  return "unknown";
}

/** UI copy for a failed image GENERATION. The input is never echoed. */
export function imageGenerationFailureCopy(raw: unknown): string {
  return GENERATION_COPY[classifyGenerationFailure(raw)];
}

/** UI copy for a failed real-photo EDIT. The input is never echoed. */
export function imageEditFailureCopy(raw: unknown): string {
  return EDIT_COPY[classifyGenerationFailure(raw)];
}

/**
 * Logs the raw provider text — SERVER SIDE ONLY, from the redaction call sites
 * below, because that is the last place the raw string exists. Deliberately
 * separate from the copy functions so the pairing — "diagnostics here,
 * allowlisted copy there" — is visible where it matters.
 */
export function logGenerationDiagnostics(context: string, raw: unknown): void {
  if (typeof raw === "string" && raw.trim().length > 0) {
    console.warn(`[${context}] image pipeline failure:`, raw);
  }
}

/**
 * Server-side redaction. The raw provider string must not merely go unrendered
 * — it must not reach the browser at all, because a serialized React prop is
 * still page source a judge (or anyone) can read, and a 401 body can carry a
 * key prefix. Route handlers and server components replace the field with this
 * classified token before serializing; `classifyGenerationFailure` accepts the
 * token, so the copy on the other side is unchanged.
 */
export function redactGenerationError(raw: unknown, context = "improve"): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  logGenerationDiagnostics(context, raw);
  return classifyGenerationFailure(raw);
}

/** Applies `redactGenerationError` to a channel's `after_json` blob. Returns
 *  the value unchanged when it carries no error field. */
export function redactChannelAfter(after: unknown): unknown {
  if (!after || typeof after !== "object" || Array.isArray(after)) return after;
  const record = after as Record<string, unknown>;
  const hasGeneration = typeof record.generation_error === "string";
  const hasEdit = typeof record.edit_error === "string";
  if (!hasGeneration && !hasEdit) return after;
  return {
    ...record,
    ...(hasGeneration ? { generation_error: redactGenerationError(record.generation_error) } : {}),
    ...(hasEdit ? { edit_error: redactGenerationError(record.edit_error) } : {}),
  };
}
