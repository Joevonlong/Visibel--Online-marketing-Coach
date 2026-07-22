// ISS-033: the frontend half of FEA-114's image taxonomy.
//
// Two jobs, both about not misleading anyone:
//
//  1. `skipped_reason` on a channel means the planner DECIDED not to generate —
//     the business's own photos already cover that category. That is a good
//     outcome, but the report rendered it as an empty panel (no image, no
//     error, no explanation), which reads as "this didn't work".
//  2. Category labels turn an unexplained wall of pictures into a visibly
//     deliberate composition.
//
// The raw `skipped_reason` string is NOT rendered: it is internal planner prose
// carrying enum names and quoted internals ("work_result is already covered
// and every other shot-list category for this trade is too…"). Same rule as
// ISS-023/ISS-030 — copy comes from an allowlist keyed by the machine-readable
// value, here the category enum. Pure module, node-testable.

import { ImageCategory } from "../../lib/schemas";

/** Short chip label. Sentence case — these sit next to "AI concept". */
const CATEGORY_LABEL: Record<ImageCategory, string> = {
  storefront: "Storefront",
  team: "Team",
  work_result: "Work result",
  craft_detail: "Craft detail",
  credentials: "Credentials",
  equipment: "Equipment",
  other: "Photo",
};

/** How the category reads inside a sentence. */
const CATEGORY_PHRASE: Record<ImageCategory, string> = {
  storefront: "your shopfront",
  team: "your team",
  work_result: "finished work",
  craft_detail: "close-up craft detail",
  credentials: "certificates and credentials",
  equipment: "tools and equipment",
  other: "this part of the page",
};

function parseCategory(raw: unknown): ImageCategory | null {
  const parsed = ImageCategory.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Chip text for a category, or null when the field is absent/unrecognized —
 *  pre-FEA-114 rows simply render no chip rather than a wrong one. */
export function imageCategoryLabel(raw: unknown): string | null {
  const category = parseCategory(raw);
  return category ? CATEGORY_LABEL[category] : null;
}

export type SkippedOnPurpose = { title: string; body: string };

/**
 * Copy for a channel the planner deliberately skipped. Never echoes the raw
 * `skipped_reason`; the category (a closed enum) picks the sentence, and an
 * unknown/absent category still yields honest generic copy.
 */
export function skippedOnPurposeCopy(rawCategory: unknown): SkippedOnPurpose {
  const category = parseCategory(rawCategory);
  const what = category ? CATEGORY_PHRASE[category] : "this part of the page";
  return {
    title: "Skipped on purpose",
    body: `Your own photos already cover ${what}, so nothing was generated here. Real photos beat an AI concept every time — we only add one where you are missing a shot.`,
  };
}

/** True when a channel's `after` blob says the planner skipped generation.
 *  Reads defensively: the blob shape is owned by the improve lane. */
export function isSkippedOnPurpose(after: unknown): boolean {
  if (!after || typeof after !== "object") return false;
  const record = after as Record<string, unknown>;
  return typeof record.skipped_reason === "string" && record.skipped_reason.trim().length > 0;
}
