// Shared helper for ChannelRow's mini before-excerpt and
// BeforeAfterInline's before block. `channel.before` (Channel.before_json)
// is z.unknown() by design (lib/schemas.ts) — lib/rubric.ts's
// `buildBeforeForChannel` writes `{excerpts: string[]}` for text channels at
// analyze time, but hand-authored fixtures (lib/fixtures/replay-audit.json)
// use ad-hoc shapes instead (`current_h1`, `current_cta`, `note`, …), and
// image channels use `{asset_ref | asset_refs, note}`. This stays defensive
// across all of them rather than assuming one shape.
export function deriveBeforeExcerpt(before: unknown): string | null {
  if (before === null || before === undefined) return null;
  if (typeof before === "string") return before.trim().length > 0 ? before : null;
  if (typeof before !== "object") return String(before);

  const record = before as Record<string, unknown>;

  if (Array.isArray(record.excerpts) && record.excerpts.length > 0) {
    return record.excerpts.map(String).join(" · ");
  }

  const preferredKeys = ["current_text", "current_h1", "current_cta", "note"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }

  // Last resort: the first non-empty string value on the object, so a
  // shape we didn't anticipate still surfaces something rather than
  // silently rendering nothing.
  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }

  return null;
}
