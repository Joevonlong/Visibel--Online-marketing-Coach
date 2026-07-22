// FEA-115: the report page's half of FEA-112's streamed partials.
//
// When a partial arrives, lib/improve/orchestrate.ts publishes it against the
// channel — `generated_asset_id` is set and `partial: true` — while the channel
// STAYS "improving" (the final frame overwrites the same asset id in place).
// The preview page already showed that early frame (ISS-032); the report page
// showed nothing at all until the channel reached "improved", so for the first
// ~40s of a real run the visitor watched a spinner with a finished image
// sitting in the database.
//
// This module answers one question — "is there an early frame to show right
// now?" — as a pure function so it is testable without a DOM, and so the
// honesty rule stays in one place: an early frame is only ever shown WITH the
// pending label. It is never presented as the finished result.

/** What the row should render while a channel is still improving. */
export type PartialFrame = {
  assetId: string;
  /** FEA-114 category of the slot, for the label chip. Unknown -> undefined. */
  category?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The early frame for a channel, or null when there is nothing to show yet.
 *
 * Deliberately requires BOTH conditions:
 *   - the channel is still improving (an improved channel gets the full
 *     BeforeAfterInline reveal instead — this must not double-render), and
 *   - an asset id has actually been published.
 *
 * `partial: true` is NOT required: a published asset on an improving channel is
 * an early frame by definition, and treating a missing flag as "not partial"
 * would silently hide the image this feature exists to show.
 */
export function resolvePartialFrame(
  status: string,
  after: unknown,
  hasAsset: (assetId: string) => boolean
): PartialFrame | null {
  if (status !== "improving") return null;
  const record = asRecord(after);
  if (!record) return null;
  const assetId = record.generated_asset_id;
  if (typeof assetId !== "string" || assetId.length === 0) return null;
  // The asset row must actually be readable — the server tree is refreshed
  // separately from the poll payload (ISS-032), so for a beat the id can be
  // known while the row is not yet in this render's asset list.
  if (!hasAsset(assetId)) return null;
  return { assetId, category: record.content_category };
}
