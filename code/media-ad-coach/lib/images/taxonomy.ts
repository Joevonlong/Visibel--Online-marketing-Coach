/**
 * FEA-114 — Image content taxonomy and composition policy.
 *
 * The defect this exists to prevent (human review, 2026-07-21): the After
 * page's "Our work" gallery showed four images, three of which were "the team
 * standing in front of the van". Images were treated as interchangeable
 * content — no notion of WHAT an image shows, so nothing stopped one category
 * from filling every slot, and nothing stopped the generator from inventing a
 * third team photo for a business that already had two.
 *
 * A marketing director does not think in "images", they think in a SHOT LIST:
 * one storefront, one team, several results, a detail or two, the credentials.
 * This module is that shot list, expressed as data:
 *
 *   1. `ImageCategory`      — what an image shows.
 *   2. `CompositionPolicy`  — per-trade slot priorities and per-category
 *                             quotas ("one of a kind is enough").
 *   3. `classifyByHeuristic`— a cheap, honest fallback classifier.
 *   4. `planComposition`    — assigns concrete assets to concrete slots and
 *                             says WHY, so the decision is auditable.
 *
 * Everything here is pure and data-driven: adding a trade means adding a
 * policy object, not editing branching logic. The categories are deliberately
 * LOOSE — an image only has to be more like one bucket than the others, and
 * anything unclear is honestly `other` rather than force-fit.
 */
import type { AssetRecord } from "../db";
import { ImageCategory, type Trade } from "../schemas";
import { contentText } from "../improve/curate";
import { isNearDuplicate } from "./fingerprint";

export type { ImageCategory };

export const ALL_IMAGE_CATEGORIES: readonly ImageCategory[] = ImageCategory.options;

// ---------------------------------------------------------------------------
// Per-trade composition policy
// ---------------------------------------------------------------------------

export interface CompositionPolicy {
  /** Ordered preference for the single hero slot. */
  hero_priority: readonly ImageCategory[];
  /** Ordered preference for the about/team slot. */
  team_priority: readonly ImageCategory[];
  /** Ordered preference for filling gallery slots. Earlier = shown first. */
  gallery_priority: readonly ImageCategory[];
  /** Hard cap per category across the gallery. The whole point: "one of a
   *  kind is enough" for people-shots and storefronts, while genuine work and
   *  craft detail — the things a customer is actually buying — may repeat. */
  gallery_quota: Readonly<Partial<Record<ImageCategory, number>>>;
  /** FEA-117 (human decision 2026-07-21): the After page's gallery must never
   *  look empty. When curation and dedup leave fewer than this many images, the
   *  generator fills the gap with DIFFERENT content — never copies. */
  gallery_min: number;
  /** What is worth GENERATING when the business has no real photo of it,
   *  most valuable first. The generator walks this list and skips anything
   *  already covered, which is what stops a third team portrait from being
   *  invented for a business that already has two. */
  generation_targets: readonly ImageCategory[];
}

const DEFAULT_QUOTA: Readonly<Partial<Record<ImageCategory, number>>> = {
  storefront: 1,
  team: 1,
  credentials: 1,
  equipment: 1,
  work_result: 3,
  craft_detail: 2,
  other: 1,
};

/** Trade-agnostic baseline: what any local service business's page wants. */
const DEFAULT_POLICY: CompositionPolicy = {
  // ISS-034: the hero is the one picture that has to make a stranger want this
  // business. That is the WORK, then the craft — never the van fleet. Equipment
  // is deliberately last: a photo of parked vehicles says nothing about whether
  // the job will be done well, and it is what filled the hero slot in the
  // reported defect.
  hero_priority: ["work_result", "craft_detail", "team", "storefront", "credentials", "other", "equipment"],
  team_priority: ["team", "storefront", "work_result", "other"],
  gallery_priority: ["work_result", "craft_detail", "storefront", "credentials", "equipment", "team", "other"],
  gallery_quota: DEFAULT_QUOTA,
  gallery_min: 4,
  generation_targets: ["work_result", "craft_detail", "team", "storefront"],
};

/** Per-trade overrides, merged over `DEFAULT_POLICY`. Only the fields that
 *  genuinely differ are listed — a doctor's practice sells reassurance and
 *  premises rather than finished repairs, a roofer sells the finished roof. */
const TRADE_POLICY_OVERRIDES: Partial<Record<Trade, Partial<CompositionPolicy>>> = {
  doctor: {
    // A practice sells reassurance: the rooms and the people, not repairs.
    // Equipment still ranks above nothing, but never leads (ISS-034).
    hero_priority: ["storefront", "team", "work_result", "credentials", "craft_detail", "other", "equipment"],
    gallery_priority: ["storefront", "team", "credentials", "equipment", "work_result", "craft_detail", "other"],
    // A practice has no "finished jobs" to show; rooms and reassurance carry it.
    gallery_quota: { ...DEFAULT_QUOTA, storefront: 3, work_result: 1, craft_detail: 1, equipment: 2 },
    generation_targets: ["storefront", "team", "equipment", "credentials"],
  },
  roofing: {
    hero_priority: ["work_result", "craft_detail", "team", "storefront", "credentials", "other", "equipment"],
    gallery_quota: { ...DEFAULT_QUOTA, work_result: 4, craft_detail: 2, storefront: 1 },
  },
  handyman: {
    // Breadth of jobs is the selling point, so more finished results.
    gallery_quota: { ...DEFAULT_QUOTA, work_result: 4 },
  },
};

export function compositionPolicyFor(trade: Trade | undefined): CompositionPolicy {
  const override = trade ? TRADE_POLICY_OVERRIDES[trade] : undefined;
  return override ? { ...DEFAULT_POLICY, ...override } : DEFAULT_POLICY;
}

// ---------------------------------------------------------------------------
// Classification — persisted on the asset, with an honest source label
// ---------------------------------------------------------------------------

export type CategorySource = "vision" | "heuristic" | "generated";

export interface AssetCategory {
  category: ImageCategory;
  confidence: number;
  source: CategorySource;
}

/** Loose keyword hints per category, matched against everything already known
 *  about an asset (alt text, source URL/filename, and the Visual Director's
 *  own per-criterion evidence). This is the FALLBACK path — the vision
 *  classifier is authoritative — so the hints stay generous and the tie-break
 *  order below decides when several match. German + English. */
const CATEGORY_HINTS: Readonly<Record<Exclude<ImageCategory, "other">, RegExp>> = {
  credentials: /(zertifikat|zertifiziert|certificate|certified|urkunde|meister|innung|handwerkskammer|t[üu]v|gepr[üu]ft|siegel|auszeichnung|award|pr[üu]fzeichen|lizenz|license|qualifikation|diplom|approbation)/i,
  team: /(\bteam\b|owner|inhaber|mitarbeiter|crew|\bstaff\b|portrait|porträt|kolleg|geschäftsführer|people standing|group of|meisterbetrieb team|our people|praxisteam)/i,
  storefront: /(storefront|shopfront|store front|laden|filiale|showroom|premises|geb[äa]ude|building exterior|entrance|eingang|reception|empfang|praxis|office exterior|werkstatt|workshop|\bvan\b|vehicle|fahrzeug|transporter|truck|signage on|firmenschild)/i,
  work_result: /(finished|fertig|completed|abgeschlossen|after|nachher|before|vorher|renovat|sanierung|installed|installation|neues bad|new bathroom|new kitchen|umbau|result|ergebnis|referenz|project|projekt|job[\s-]?site|on[\s-]?site)/i,
  craft_detail: /(close[\s-]?up|detail|nahaufnahme|craftsmanship|handwerk|weld|l[öo]t|fitting|armatur|joint|naht|fuge|tile work|fliesen|pipework|rohrleitung|wiring|verkabelung|seam|finish detail|texture)/i,
  equipment: /(tool|werkzeug|equipment|ger[äa]t|machine|maschine|instrument|apparat|ausr[üu]stung|toolbox|werkzeugkoffer|kompressor|messger[äa]t|diagnostic device)/i,
};

/** Tie-break order when several hint sets match one image: the most specific,
 *  hardest-to-fake signal wins. A certificate is unmistakable; "other" never
 *  wins a tie, it is only what remains when nothing matched. */
const HEURISTIC_PRECEDENCE: readonly Exclude<ImageCategory, "other">[] = [
  "credentials",
  "team",
  "craft_detail",
  "work_result",
  "storefront",
  "equipment",
];

/** Cheap classification from metadata this repo already has — no model call.
 *  Used when the vision classifier is unavailable or failed, and as the
 *  starting point for assets that predate FEA-114. Confidence is deliberately
 *  low: this is a hint, not a judgement. */
export function classifyByHeuristic(asset: AssetRecord): AssetCategory {
  const text = contentText(asset);
  for (const category of HEURISTIC_PRECEDENCE) {
    if (CATEGORY_HINTS[category].test(text)) {
      return { category, confidence: 0.4, source: "heuristic" };
    }
  }
  return { category: "other", confidence: 0.2, source: "heuristic" };
}

interface CategoryMeta {
  content_category?: unknown;
  content_category_confidence?: unknown;
  content_category_source?: unknown;
}

/** Reads the persisted classification off an asset, falling back to the
 *  heuristic so every asset always HAS a category (unclassifiable → `other`,
 *  stated honestly via `source`). */
export function categoryOf(asset: AssetRecord): AssetCategory {
  const meta = (asset.meta_json ?? null) as CategoryMeta | null;
  const parsed = ImageCategory.safeParse(meta?.content_category);
  if (!parsed.success) return classifyByHeuristic(asset);
  const confidence = typeof meta?.content_category_confidence === "number" ? meta.content_category_confidence : 0.5;
  const source: CategorySource =
    meta?.content_category_source === "vision" || meta?.content_category_source === "generated"
      ? meta.content_category_source
      : "heuristic";
  return { category: parsed.data, confidence, source };
}

// ---------------------------------------------------------------------------
// Composition planning — which asset fills which slot, and why
// ---------------------------------------------------------------------------

export interface CompositionCandidate {
  asset: AssetRecord;
  category: ImageCategory;
  /** ISS-035: identity of the CONTENT, not of the row. An edited image and the
   *  photo it was edited from are the same picture to a visitor, so they share
   *  a lineage root and compete for one slot. */
  lineage_root: string;
  /** Higher is better within a category (vision score, size, generated-ness). */
  strength: number;
  /** Exempt from the per-category quota. A quota exists to stop DUPLICATE
   *  content ("three team-in-front-of-the-van shots"); it must never silently
   *  drop an image we cannot prove is duplicative. That is exactly the case
   *  for a generated/enhanced image this run produced whose category is
   *  `other` — unclassified, and new by construction (ISS-017: the After page
   *  is new-by-default). Everything with a KNOWN category is capped normally,
   *  including generated ones, which is what keeps a gap-filling generator
   *  honest. */
  quota_exempt: boolean;
}

export interface SlotDecision {
  slot: "hero" | "team" | `gallery_${number}`;
  asset_id: string;
  category: ImageCategory;
  reason: string;
}

/** Ranks candidates the way an editor would: a freshly generated concept for
 *  this business beats an old photo, a well-scored large photo beats a weak
 *  one, and a confident classification beats a guessed one. */
export function strengthOf(asset: AssetRecord, category: AssetCategory): number {
  const scored = Array.isArray(asset.score_json)
    ? asset.score_json.reduce((sum: number, entry) => {
        const score = (entry as { score?: unknown } | null)?.score;
        return sum + (typeof score === "number" ? score : 0);
      }, 0)
    : 0;
  const meta = (asset.meta_json ?? null) as { width?: unknown; height?: unknown } | null;
  const shortEdge =
    typeof meta?.width === "number" && typeof meta?.height === "number" ? Math.min(meta.width, meta.height) : 0;
  const generatedBonus = asset.kind === "generated_image" ? 40 : 0;
  return generatedBonus + scored + Math.min(shortEdge, 1600) / 100 + category.confidence * 5;
}

/** FEA-117: what a picture is OF, beyond its category — "finished tiled
 *  bathroom" vs "new gas boiler". Vision writes it at classification time
 *  (ISS-034 `content_category_subject`); generation writes the subject it was
 *  asked for. Used to keep several `work_result` tiles from being the same
 *  room from three angles. */
export function subjectOf(asset: AssetRecord): string | null {
  const meta = (asset.meta_json ?? null) as { content_category_subject?: unknown; generation_subject?: unknown } | null;
  const raw = typeof meta?.generation_subject === "string" ? meta.generation_subject : meta?.content_category_subject;
  if (typeof raw !== "string") return null;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9äöüß ]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

/** ISS-035: an asset's content identity — its edit source when it has one
 *  (`performImageEdit` records `source_asset_id` on every enhanced image), else
 *  itself. Exported for tests and for callers that need to exclude the content
 *  already used by another slot. */
export function lineageRootOf(asset: AssetRecord): string {
  const meta = (asset.meta_json ?? null) as { source_asset_id?: unknown } | null;
  return typeof meta?.source_asset_id === "string" ? meta.source_asset_id : asset.id;
}

export function buildCandidates(assets: AssetRecord[]): CompositionCandidate[] {
  return assets.map((asset) => {
    const category = categoryOf(asset);
    return {
      asset,
      category: category.category,
      lineage_root: lineageRootOf(asset),
      strength: strengthOf(asset, category),
      quota_exempt: asset.kind === "generated_image" && category.category === "other",
    };
  });
}

/** Which categories the business ALREADY has real (non-generated) coverage of.
 *  This is what the generation planner subtracts from its target list. */
export function coveredCategories(assets: AssetRecord[], opts: { includeGenerated?: boolean } = {}): Set<ImageCategory> {
  const covered = new Set<ImageCategory>();
  for (const asset of assets) {
    const isReal = asset.kind === "harvested_image" || asset.kind === "uploaded_image";
    if (!isReal && !opts.includeGenerated) continue;
    if (!isReal && asset.kind !== "generated_image") continue;
    const { category } = categoryOf(asset);
    if (category !== "other") covered.add(category);
  }
  return covered;
}

/** Picks gallery entries under the policy's per-category quota, filling in
 *  priority order and ROUND-ROBIN across categories so the result is diverse
 *  by construction: one work_result, one craft_detail, one storefront, …
 *  before a second of anything. This is the direct fix for "three of the four
 *  photos are the team in front of the van". Input order is preserved as the
 *  in-category tie-break, so callers can pre-rank. */
/** ISS-035: keeps only the BEST version of each piece of content — an enhanced
 *  image and the photo it was edited from are one picture, and the improved
 *  version is the one worth showing. Applied to every slot decision, not just
 *  the gallery, so the About section cannot show the raw original while the
 *  gallery shows its enhanced twin. */
export function collapseLineages(candidates: CompositionCandidate[]): CompositionCandidate[] {
  const best = new Map<string, CompositionCandidate>();
  for (const candidate of candidates) {
    const incumbent = best.get(candidate.lineage_root);
    if (!incumbent || candidate.strength > incumbent.strength) best.set(candidate.lineage_root, candidate);
  }
  return [...best.values()];
}

export interface SelectGalleryOptions {
  /** ISS-035: content already used by another slot (typically the hero) — it
   *  must not appear again in the gallery. */
  exclude_lineages?: ReadonlySet<string>;
}

export function selectGallery(
  candidates: CompositionCandidate[],
  policy: CompositionPolicy,
  limit: number,
  options: SelectGalleryOptions = {},
): SlotDecision[] {
  const excluded = options.exclude_lineages ?? new Set<string>();
  const deduped = collapseLineages(candidates).filter((c) => !excluded.has(c.lineage_root));

  const byCategory = new Map<ImageCategory, CompositionCandidate[]>();
  const exempt: CompositionCandidate[] = [];
  for (const candidate of deduped) {
    if (candidate.quota_exempt) {
      exempt.push(candidate);
      continue;
    }
    const bucket = byCategory.get(candidate.category) ?? [];
    bucket.push(candidate);
    byCategory.set(candidate.category, bucket);
  }
  exempt.sort((a, b) => b.strength - a.strength);
  for (const bucket of byCategory.values()) bucket.sort((a, b) => b.strength - a.strength);

  const taken: SlotDecision[] = [];
  const usedPerCategory = new Map<ImageCategory, number>();
  // ISS-035 defensive layer: two pictures with no lineage between them can
  // still BE the same picture (same file harvested twice, same scene shot
  // twice). Fingerprints that are missing or malformed never count as
  // duplicates — unknown is not "the same".
  const takenFingerprints: unknown[] = [];
  // FEA-117: a category may repeat only with a DIFFERENT subject — three
  // photos of the same bathroom are as repetitive as three team shots.
  const takenSubjects = new Set<string>();
  const isDuplicateOfTaken = (candidate: CompositionCandidate): boolean => {
    const fingerprint = (candidate.asset.meta_json as { fingerprint?: unknown } | null)?.fingerprint;
    if (takenFingerprints.some((seen) => isNearDuplicate(seen, fingerprint))) return true;
    const subject = subjectOf(candidate.asset);
    const subjectKey = subject ? `${candidate.category}:${subject}` : null;
    if (subjectKey && takenSubjects.has(subjectKey)) return true;
    takenFingerprints.push(fingerprint);
    if (subjectKey) takenSubjects.add(subjectKey);
    return false;
  };

  // This run's own unclassified output leads: it is new, it is what the
  // customer is being shown as the improvement, and it cannot be proven
  // duplicative of anything.
  for (const candidate of exempt) {
    if (taken.length >= limit) break;
    if (isDuplicateOfTaken(candidate)) continue;
    taken.push({
      slot: `gallery_${taken.length}`,
      asset_id: candidate.asset.id,
      category: candidate.category,
      reason: "generated for this run (new by default, exempt from category quota)",
    });
  }

  const order = [...policy.gallery_priority, ...ALL_IMAGE_CATEGORIES.filter((c) => !policy.gallery_priority.includes(c))];

  // Round-robin passes: pass 1 takes the best of each category in priority
  // order, pass 2 the second-best where the quota allows, and so on.
  for (let pass = 0; taken.length < limit; pass++) {
    let progressed = false;
    for (const category of order) {
      if (taken.length >= limit) break;
      const quota = policy.gallery_quota[category] ?? 1;
      const used = usedPerCategory.get(category) ?? 0;
      if (used >= quota) continue;
      const candidate = byCategory.get(category)?.[pass];
      if (!candidate) continue;
      if (isDuplicateOfTaken(candidate)) {
        progressed = true; // it was consumed, just not shown
        continue;
      }
      usedPerCategory.set(category, used + 1);
      taken.push({
        slot: `gallery_${taken.length}`,
        asset_id: candidate.asset.id,
        category,
        reason:
          used === 0
            ? `first ${category} image (priority ${order.indexOf(category) + 1} for this trade)`
            : `${used + 1}. ${category} image, within this trade's quota of ${quota}`,
      });
      progressed = true;
    }
    if (!progressed) break; // nothing left that any quota allows
  }
  return taken;
}

/** Picks the single best asset for a named slot following the slot's category
 *  priority, and says which rung it landed on. */
export function selectSlot(
  candidates: CompositionCandidate[],
  priority: readonly ImageCategory[],
  slot: "hero" | "team",
): SlotDecision | null {
  for (const category of priority) {
    const best = candidates
      .filter((c) => c.category === category)
      .sort((a, b) => b.strength - a.strength)[0];
    if (best) {
      return {
        slot,
        asset_id: best.asset.id,
        category,
        reason: `best available ${category} image (${slot} priority ${priority.indexOf(category) + 1})`,
      };
    }
  }
  const fallback = [...candidates].sort((a, b) => b.strength - a.strength)[0];
  return fallback
    ? { slot, asset_id: fallback.asset.id, category: fallback.category, reason: `no preferred category available — strongest remaining image` }
    : null;
}

// ---------------------------------------------------------------------------
// ISS-034 · What may be EDITED into the hero image
// ---------------------------------------------------------------------------

/** The hero slot may upgrade one of the business's own photos (F-096/ISS-008)
 *  — but only when that photo is worth being the headline. In the reported
 *  defect the edit source was chosen purely by score, and with every asset
 *  unscored that degenerated to "whatever row was inserted first": an uploaded
 *  snapshot of three parked vans, which then became the hero AND (via a second
 *  edit) two more tiles. Content, not insertion order, decides now. */
export const HERO_EDIT_SOURCE_CATEGORIES: readonly ImageCategory[] = ["work_result", "craft_detail", "team", "storefront"];

/** Categories that must never headline the page, however well they score. */
const HERO_FORBIDDEN_CATEGORIES: readonly ImageCategory[] = ["equipment", "credentials"];

/** ISS-034: content the classifier LOOKED AT and judged unusable — a
 *  screenshot, a logo, a map, a price list. Enhancing one of these produces a
 *  garbled invention wearing the "enhanced photo" label (ISS-019's concern),
 *  and it is what happened in the reported defect: an uploaded Google-listing
 *  screenshot was edited twice and became the page hero. "Unknown" is not
 *  "known bad" — an unclassified image is still editable. */
export function isKnownUnusableContent(assetCategory: AssetCategory): boolean {
  return assetCategory.category === "other" && assetCategory.source === "vision" && assetCategory.confidence >= 0.5;
}

/** Decides whether a real photo may be UPGRADED into the hero image.
 *
 *  The distinction that matters here is "known bad" vs "not known": blocking
 *  everything unclassified would quietly delete the F-096/ISS-008 behaviour of
 *  preferring the business's own photo whenever the classifier is unavailable.
 *  So a confident VISION verdict of `other` ("a screenshot", "a logo") blocks,
 *  while an `other` that merely means "nobody classified this" does not. */
export function isHeroEditableCategory(assetCategory: AssetCategory): boolean {
  if (HERO_FORBIDDEN_CATEGORIES.includes(assetCategory.category)) return false;
  if (assetCategory.category === "other") return !isKnownUnusableContent(assetCategory);
  return HERO_EDIT_SOURCE_CATEGORIES.includes(assetCategory.category);
}

/** Ranks an audit's real photos for a category-aware pick: preferred
 *  categories first (in `priority` order), strongest within a category. Used
 *  by the hero edit path so it upgrades the best WORK photo rather than the
 *  first row in the table. */
export function rankRealPhotosForSlot(
  assets: AssetRecord[],
  priority: readonly ImageCategory[],
): { asset: AssetRecord; category: ImageCategory; classification: AssetCategory }[] {
  const candidates = buildCandidates(assets.filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image"));
  const rank = (category: ImageCategory): number => {
    const index = priority.indexOf(category);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return candidates
    .sort((a, b) => rank(a.category) - rank(b.category) || b.strength - a.strength)
    .map((c) => ({ asset: c.asset, category: c.category, classification: categoryOf(c.asset) }));
}
