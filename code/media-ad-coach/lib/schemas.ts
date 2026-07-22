/**
 * FROZEN HOUR-0 CONTRACT — changes require team-wide agreement (see FEATURE-TRACKER.md rule 6).
 *
 * Source: docs/team-idea/final-implement-plan/impelemet-plan.md
 *   - Appendix A (Criterion/Finding/Channel/Report, followed verbatim)
 *   - §2.2/§2.3 (T1-T8, I1-I6 criterion ids)
 *   - §2.5 (12-channel catalog + per-channel "after" fields)
 *   - §3.1/§3.3/§3.4 (WebsiteEvidence / GbpEvidence / PortalEvidence)
 *   - §4.2/§4.4 (rewrite output shape, preview_json)
 *   - §5.3 (data model) / §5.4 (API bodies) / §5.5 (progress step names)
 *
 * zod v4 API throughout (this repo pins zod ^4.4.3 — the package's default
 * export IS v4, no `zod/v4` subpath import needed).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared vocabularies
// ---------------------------------------------------------------------------

/** Fixed 12-channel catalog (plan §2.5). Order here is catalog order, not
 *  priority order — actual row order is computed by rubric.ts. */
export const ChannelId = z.enum([
  "hero_headline",
  "business_description",
  "services_copy",
  "cta_contact",
  "legal_footer",
  "platform_consistency",
  "hero_image",
  "work_proof_images",
  "team_image",
  "image_fixes",
  "optimized_site",
  "promo_video",
]);
export type ChannelId = z.infer<typeof ChannelId>;

/** The 6 text channels that get a rewrite via lib/improve/text.ts (plan §4.2/F-050).
 *  Image channels (hero_image/work_proof_images/team_image/image_fixes) go through
 *  lib/improve/image.ts instead; optimized_site is assembled, promo_video is disabled. */
export const TextChannelId = z.enum([
  "hero_headline",
  "business_description",
  "services_copy",
  "cta_contact",
  "legal_footer",
  "platform_consistency",
]);
export type TextChannelId = z.infer<typeof TextChannelId>;

export const Trade = z.enum([
  "plumber",
  "electrician",
  "roofing",
  "handyman",
  "doctor",
  "other",
]);
export type Trade = z.infer<typeof Trade>;

/** Sections cheerio tags visible website copy into (plan §3.1). Reused for the
 *  preview page's "Before" panel (§4.4) so both sides speak the same shape. */
export const WebsiteTextSection = z.enum(["hero", "about", "services", "footer"]);
export type WebsiteTextSection = z.infer<typeof WebsiteTextSection>;

export const SectionTaggedText = z.object({
  section: WebsiteTextSection,
  text: z.string(),
});
export type SectionTaggedText = z.infer<typeof SectionTaggedText>;

export const AuditStatus = z.enum([
  "draft",
  "analyzing",
  "scored",
  "improving",
  "complete",
  "failed",
]);
export type AuditStatus = z.infer<typeof AuditStatus>;

export const AssetKind = z.enum([
  "harvested_image",
  "uploaded_image",
  "gbp_screenshot",
  "generated_image",
]);
export type AssetKind = z.infer<typeof AssetKind>;

/** Truth badge shown on generated/edited images. NULL = a real harvested/uploaded photo. */
export const AssetLabel = z.enum(["ai_concept", "enhanced"]).nullable();
export type AssetLabel = z.infer<typeof AssetLabel>;

// ---------------------------------------------------------------------------
// Appendix A — Criterion / Finding / Channel / Report (verbatim semantics)
// ---------------------------------------------------------------------------

export const Criterion = z.object({
  id: z.string(),
  score: z.number().int().min(0).max(5),
  evidence: z.string(),
  source: z.enum(["fetched", "tavily", "vision", "screenshot", "manual", "absent"]),
});
export type Criterion = z.infer<typeof Criterion>;

export const Finding = z.object({
  id: z.string(),
  lane: z.enum(["text", "image"]),
  criterion: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  evidence_quote: z.string(),
  asset_ref: z.string().nullable(),
});
export type Finding = z.infer<typeof Finding>;

export const Channel = z.object({
  // Extension: Appendix A leaves `id` as z.string(); tightened to the fixed
  // 12-channel catalog (§2.5) now that it is pinned, so a typo'd channel id
  // fails fast instead of silently rendering an empty row.
  id: ChannelId,
  lane: z.enum(["text", "image", "site", "video"]),
  title: z.string(),
  one_liner: z.string(),
  priority: z.number(),
  severity: z.enum(["high", "medium", "low"]),
  status: z.enum(["todo", "improving", "improved", "coming_soon"]),
  finding_ids: z.array(z.string()),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type Channel = z.infer<typeof Channel>;

export const TavilyFindability = z.object({
  status: z.enum(["found", "portals_only", "not_found", "error"]),
  results: z.array(z.object({ title: z.string(), url: z.string() })),
  source: z.literal("tavily"),
});
export type TavilyFindability = z.infer<typeof TavilyFindability>;

const MemoryNote = z.object({
  text: z.string(),
  similar_count: z.number().int(),
});

export const Report = z.object({
  overall_score: z.number().int(),
  band: z.string(),
  text: z.object({ score: z.number().int(), criteria: z.array(Criterion) }),
  images: z.object({
    score: z.number().int(),
    criteria_by_asset: z.record(z.string(), z.array(Criterion)),
    coverage_gaps: z.array(z.string()),
  }),
  findability: TavilyFindability,
  presence_coverage: z.object({
    website: z.boolean(),
    maps: z.boolean(),
    yellow_pages: z.boolean(),
    other_count: z.number().int(),
    nap_consistent: z.boolean().nullable(),
  }),
  reputation_chips: z
    .object({
      review_count: z.number().nullable(),
      rating: z.number().nullable(),
      has_photo_reviews: z.boolean().nullable(),
    })
    .nullable(),
  findings: z.array(Finding),
  channels: z.array(Channel),
  executive_summary: z.string(),
  memory_note: MemoryNote.nullable(),
  execution_mode: z.enum(["LIVE", "REPLAY"]),
  disclaimers: z.array(z.string()),
});
export type Report = z.infer<typeof Report>;

// ---------------------------------------------------------------------------
// Business input — POST /api/audits body (plan §5.4)
// ---------------------------------------------------------------------------

const GbpManual = z.object({
  review_count: z.number().int().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
  description: z.string().optional(),
});

export const BusinessInput = z.object({
  brand_name: z.string().min(1),
  background: z.string().optional(),
  trade: Trade,
  city: z.string().optional(),
  presence: z.object({
    website: z.string().url().optional(),
    maps: z.string().url().optional(),
    yellow_pages: z.string().url().optional(),
    other: z.array(z.string().url()).optional(),
  }),
  pasted_text: z.string().optional(),
  gbp_manual: GbpManual.optional(),
});
export type BusinessInput = z.infer<typeof BusinessInput>;
// Note: the API-level rule "at least one presence link OR pasted text OR
// uploaded asset required" (§5.4/F-040) is NOT enforced here. Uploaded assets
// live in a separate table/endpoint (F-041) and the input flow creates the
// audit row before assets are attached (F-064: create -> upload -> analyze),
// so a `BusinessInput` with empty presence and no pasted_text is a valid
// intermediate state. F-040/F-042 (Owner B) must check the combined
// condition against the assets already attached to the audit.

// ---------------------------------------------------------------------------
// Evidence schemas (plan §3)
// ---------------------------------------------------------------------------

export const ImgCandidate = z.object({
  src: z.string(),
  alt: z.string().nullable(),
  natural_size: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
});
export type ImgCandidate = z.infer<typeof ImgCandidate>;

export const WebsiteEvidence = z.object({
  // Extension: plan §3.1 lists the field set but F-021 explicitly requires
  // evidence to carry a "source tagged tavily" marker when the Tavily
  // Extract fallback fires instead of the direct fetch — added as a field
  // here rather than as a separate wrapper so callers get it for free.
  source: z.enum(["fetched", "tavily"]),
  https: z.boolean(),
  title: z.string().nullable(),
  h1: z.string().nullable(),
  meta_description: z.string().nullable(),
  has_viewport_meta: z.boolean(),
  tel_links: z.array(z.string()),
  // Extension: "section-tagged" (§3.1) is modeled as a structured array
  // rather than one string with inline markers, so the Copy Strategist can
  // cite {section, text} directly without re-parsing.
  visible_text: z.array(SectionTaggedText),
  nav_links: z.array(z.string()),
  has_impressum: z.boolean(),
  has_datenschutz: z.boolean(),
  img_candidates: z.array(ImgCandidate),
  // ISS-025 (additive, optional — approved 2026-07-21 as the only sanctioned
  // extension of this frozen shape: no existing field changed or removed, so
  // every previously persisted evidence blob still parses). `tel_links` above
  // stays the raw `tel:` href list; these two carry the machine-extracted
  // contact signals (tel-derived PLUS plain-text regex matches from
  // visible_text) so a site that prints its phone number as text is no longer
  // persisted as "no phone". Absent on legacy rows; `[]` means "extracted,
  // found nothing" — never fabricated.
  contact_phones: z.array(z.string()).optional(),
  contact_emails: z.array(z.string()).optional(),
});
export type WebsiteEvidence = z.infer<typeof WebsiteEvidence>;

export const PortalPlatform = z.enum(["yellow_pages", "check24", "other"]);
export type PortalPlatform = z.infer<typeof PortalPlatform>;

export const PortalEvidence = z.object({
  platform: PortalPlatform,
  url: z.string().url(),
  // Extension: symmetric with WebsiteEvidence.source — F-023 runs the same
  // fetch -> cheerio -> Tavily Extract fallback path per portal URL.
  source: z.enum(["fetched", "tavily"]),
  visible_text: z.string(),
  brand_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});
export type PortalEvidence = z.infer<typeof PortalEvidence>;

export const GbpReviewSnippet = z.object({
  author: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  text: z.string(),
});
export type GbpReviewSnippet = z.infer<typeof GbpReviewSnippet>;

export const GbpEvidence = z.object({
  review_count: z.number().int().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
  has_photo_reviews: z.boolean().optional(),
  description: z.string().optional(),
  source: z.enum(["manual", "screenshot", "link"]),
  // FEA-101 (additive, optional — approved 2026-07-21 under the same
  // "additive optional fields only" constraint as ISS-025). These carry what a
  // live Playwright read of the pasted Google Maps listing actually showed.
  // `source` deliberately keeps its three frozen values so existing consumers
  // are untouched; `live_source` is the marker that a live read contributed.
  // Every field is null/absent when Maps did not show it — never fabricated.
  phone: z.string().nullable().optional(),
  opening_hours_text: z.string().nullable().optional(),
  has_listing_photos: z.boolean().nullable().optional(),
  review_snippets: z.array(GbpReviewSnippet).optional(),
  live_source: z.literal("live_maps").optional(),
  live_fetched_at: z.string().optional(),
  /** Signed-out Google Maps serves a reduced panel with no review list/count;
   *  recorded so a missing review_count is never read as "zero reviews". */
  live_limited_view: z.boolean().optional(),
  /** Structured degradation record when the live read did not happen or failed
   *  (reason: browser_unavailable | consent_blocked | selector_miss | …). */
  live_error: z.object({ reason: z.string(), detail: z.string() }).optional(),
});
export type GbpEvidence = z.infer<typeof GbpEvidence>;

// ---------------------------------------------------------------------------
// Model-facing structured-output schemas
// ---------------------------------------------------------------------------
// OpenAI Structured Outputs (strict mode) requires every object key to be
// present in `required` — there is no optional key, only a nullable value.
// Every schema below therefore avoids z.optional() and uses z.nullable()
// wherever a field may be legitimately absent. Models never output totals;
// only per-criterion 0-5 sub-scores. lib/rubric.ts (Owner C, not this file)
// owns all total/band/priority computation.

export const ModelFinding = z.object({
  // Extension: Appendix A's `Finding` has `id` (rubric engine assigns it)
  // and `asset_ref` (not applicable to the text lane). This is a
  // deliberately narrower model-output shape per the task brief: "findings
  // without ids ... include severity + evidence_quote ... impact 1-5 +
  // effort 1-5 per finding for priority math" (lib/rubric.ts F-016 uses
  // priority = impact^2 / effort).
  criterion: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  evidence_quote: z.string(),
  impact: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
});
export type ModelFinding = z.infer<typeof ModelFinding>;

/** Copy Strategist — one structured call scoring T1-T8 against all extracted
 *  text evidence (plan §5.5 Stage 2, F-032). */
export const CopyStrategistOutput = z.object({
  criteria: z.array(Criterion), // T1..T8
  findings: z.array(ModelFinding),
});
export type CopyStrategistOutput = z.infer<typeof CopyStrategistOutput>;

export const CoverageGap = z.enum([
  "hero_shot",
  "team_shot",
  "work_proof_shot",
  "branding_shot",
]);
export type CoverageGap = z.infer<typeof CoverageGap>;

const VisualDirectorImageResult = z.object({
  asset_ref: z.string(),
  criteria: z.array(Criterion), // I1..I6
});

const VisualDirectorRedFlag = z.object({
  asset_ref: z.string(),
  reason: z.string(),
});

/** Visual Director — GPT-4o vision batches over the normalized image set
 *  (plan §5.5 Stage 2, F-033). Top-level array key `images` is an
 *  extension: the plan describes the per-image shape ("asset_ref + criteria
 *  I1-I6") but does not name the wrapping array field. */
export const VisualDirectorOutput = z.object({
  images: z.array(VisualDirectorImageResult),
  coverage_gaps: z.array(CoverageGap),
  red_flags: z.array(VisualDirectorRedFlag),
});
export type VisualDirectorOutput = z.infer<typeof VisualDirectorOutput>;

const ChannelOneLiner = z.object({
  channel_id: ChannelId,
  one_liner: z.string(),
});

/** Synthesizer — writes prose only; structurally cannot alter numbers
 *  because it has no score/total fields to emit (plan §5.5 Stage 4, F-034). */
export const SynthesizerOutput = z.object({
  executive_summary: z.string(),
  channel_one_liners: z.array(ChannelOneLiner),
  memory_note: MemoryNote.nullable(),
});
export type SynthesizerOutput = z.infer<typeof SynthesizerOutput>;

/** Vision extraction from an uploaded GBP screenshot (plan §3.3/F-025).
 *  Fields are nullable (not optional) per the Structured Outputs rule above;
 *  `source` is fixed to "screenshot" since this IS the screenshot-extraction
 *  step — precedence (manual > screenshot > link) is resolved by the
 *  pipeline, not by this schema. */
export const GbpExtractionOutput = z.object({
  review_count: z.number().int().nonnegative().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  has_photo_reviews: z.boolean().nullable(),
  description: z.string().nullable(),
});
export type GbpExtractionOutput = z.infer<typeof GbpExtractionOutput>;

// ---------------------------------------------------------------------------
// Improve schemas (plan §4.2/§4.4)
// ---------------------------------------------------------------------------

const HeroHeadlineAfter = z.object({
  h1: z.string(),
  subline: z.string(),
  cta_text: z.string(),
});

const BusinessDescriptionAfter = z.object({
  about_paragraph: z.string(),
  gbp_description_de: z.string().max(750),
  gbp_description_en: z.string().max(750),
});

const ServiceRewrite = z.object({
  service_name: z.string(),
  description: z.string(),
});

const ServicesCopyAfter = z.object({
  services: z.array(ServiceRewrite),
});

const CtaContactAfter = z.object({
  cta_text: z.string(),
  contact_block_text: z.string(),
});

const LegalFooterAfter = z.object({
  checklist: z.array(z.string()),
  footer_text: z.string(),
});

const PlatformConsistencyAfter = z.object({
  business_name: z.string(),
  phone: z.string(),
  address: z.string(),
});

/** Per-channel rewrite schemas, exported individually so lib/improve/text.ts
 *  can pass a single-channel schema to the structured-output call for that
 *  channel (F-050 makes one call per channel, up to 5 in parallel). */
export const HeroHeadlineRewrite = z.object({
  channel_id: z.literal("hero_headline"),
  before_excerpt: z.string(),
  after: HeroHeadlineAfter,
  rationale_one_liner: z.string(),
});

export const BusinessDescriptionRewrite = z.object({
  channel_id: z.literal("business_description"),
  before_excerpt: z.string(),
  after: BusinessDescriptionAfter,
  rationale_one_liner: z.string(),
});

export const ServicesCopyRewrite = z.object({
  channel_id: z.literal("services_copy"),
  before_excerpt: z.string(),
  after: ServicesCopyAfter,
  rationale_one_liner: z.string(),
});

export const CtaContactRewrite = z.object({
  channel_id: z.literal("cta_contact"),
  before_excerpt: z.string(),
  after: CtaContactAfter,
  rationale_one_liner: z.string(),
});

export const LegalFooterRewrite = z.object({
  channel_id: z.literal("legal_footer"),
  before_excerpt: z.string(),
  after: LegalFooterAfter,
  rationale_one_liner: z.string(),
});

export const PlatformConsistencyRewrite = z.object({
  channel_id: z.literal("platform_consistency"),
  before_excerpt: z.string(),
  after: PlatformConsistencyAfter,
  rationale_one_liner: z.string(),
});

/** RewriteOutput — the union of all 6 text-channel rewrite shapes (plan §4.2,
 *  Appendix A field list: {channel_id, before_excerpt, after, rationale_one_liner}).
 *  `after` is channel-specific per the §2.5 table; modeled as a discriminated
 *  union on `channel_id` at the top level (rather than nesting a second
 *  discriminant inside `after`) so the requested top-level shape is exact. */
export const RewriteOutput = z.discriminatedUnion("channel_id", [
  HeroHeadlineRewrite,
  BusinessDescriptionRewrite,
  ServicesCopyRewrite,
  CtaContactRewrite,
  LegalFooterRewrite,
  PlatformConsistencyRewrite,
]);
export type RewriteOutput = z.infer<typeof RewriteOutput>;

const PreviewServiceCard = z.object({
  title: z.string(),
  description: z.string(),
});

/** FEA-114: what an image SHOWS — the shot-list vocabulary a marketing
 *  director thinks in, used to give each page slot a category quota so one
 *  kind of picture (three team-in-front-of-the-van shots) can no longer fill
 *  the whole gallery. Deliberately loose: an image only has to be more like
 *  one bucket than the others, and anything unclear is honestly `other`.
 *  Per-trade priorities and quotas live in lib/images/taxonomy.ts. */
export const ImageCategory = z.enum([
  "storefront",
  "team",
  "work_result",
  "craft_detail",
  "credentials",
  "equipment",
  "other",
]);
export type ImageCategory = z.infer<typeof ImageCategory>;

/** FEA-114: one image's classification as the vision classifier returns it. */
export const ImageClassification = z.object({
  asset_ref: z.string(),
  // ISS-034: the model names the DOMINANT subject before it picks a bucket.
  // Forcing the observation first is what stops "three parked vans outside a
  // building" from being filed as a finished job, and it makes a wrong
  // classification visible in the evidence instead of silent.
  subject: z.string(),
  category: ImageCategory,
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});
export type ImageClassification = z.infer<typeof ImageClassification>;

export const ImageClassifierOutput = z.object({
  images: z.array(ImageClassification),
});
export type ImageClassifierOutput = z.infer<typeof ImageClassifierOutput>;

/** ISS-028: where a preview image actually came from. `generated` = this run
 *  produced it (AI concept or enhanced edit); `harvested_fallback` = the F-053
 *  ladder fell back to a photo already on the business's own site. Optional so
 *  every previously stored `preview_json` stays valid. */
export const PreviewImageSource = z.enum(["generated", "harvested_fallback"]);
export type PreviewImageSource = z.infer<typeof PreviewImageSource>;

/** ISS-028: a whitelisted reason CODE (never the provider's raw message — that
 *  can carry local paths and stack text) for why generation did not produce an
 *  image for this slot. */
export const GenerationErrorReason = z.enum(["timeout", "api_error", "missing_api_key", "no_image_data", "unknown"]);
export type GenerationErrorReason = z.infer<typeof GenerationErrorReason>;

/** ISS-031: the two ISS-028 provenance fields as they appear INSIDE
 *  `PreviewJson`. `lib/improve/preview.ts` only ever writes whitelisted values,
 *  but `preview_json` is a stored blob that other tooling (and hand-edited demo
 *  rows) can also contain — and a strict enum would fail the parse of the WHOLE
 *  preview over one unrecognized provenance string, cutting the preview that
 *  F-054 promises is never cut. `.catch()` keeps the whitelist as the only
 *  thing a reader can observe while degrading an unknown value instead of
 *  invalidating everything: an unrecognized reason reads as "unknown", an
 *  unrecognized source reads as absent. */
const PreviewImageSourceField = PreviewImageSource.optional().catch(undefined);
const GenerationErrorReasonField = GenerationErrorReason.optional().catch("unknown");

const PreviewGalleryImage = z.object({
  asset_ref: z.string(),
  label: AssetLabel,
  image_source: PreviewImageSourceField,
  // FEA-114: what this tile shows, so the renderer can label/group it and a
  // reviewer can see the composition was deliberate.
  category: ImageCategory.optional(),
});

/** Assembled one-page template content for /audit/[id]/preview (plan §4.4).
 *  Not itself a raw structured-output target — improve/preview.ts assembles
 *  it from RewriteOutput results + chosen assets, so optional fields are
 *  used where pragmatic (e.g. contact.phone may genuinely be unknown). */
export const PreviewJson = z.object({
  header: z.object({ business_name: z.string() }),
  hero: z.object({
    h1: z.string(),
    subline: z.string(),
    cta_text: z.string(),
    hero_image_ref: z.string().nullable(),
    // ISS-028: provenance of `hero_image_ref` — the After renderer must be able
    // to tell a generated image from a silently reused original.
    image_source: PreviewImageSourceField,
    generation_error_reason: GenerationErrorReasonField,
    // FEA-112: true while this slot's image is still being generated — the
    // image shown is a real streamed partial of that very generation, and a
    // sharper final frame is still on its way.
    generation_pending: z.boolean().optional(),
    // FEA-114: the category this slot was filled from.
    image_category: ImageCategory.optional(),
  }),
  trust_bar: z.object({
    years_in_business: z.string().nullable(),
    certifications: z.array(z.string()),
    review_chip: z.string().nullable(),
  }),
  // Plan §4.4: "services (3 cards)" — fixed count; preview.ts pads/truncates
  // to exactly 3 so the template layout never breaks.
  services: z.array(PreviewServiceCard).length(3),
  gallery: z.array(PreviewGalleryImage),
  about_team: z.object({
    text: z.string(),
    team_image_ref: z.string().nullable(),
    // ISS-028: see hero.image_source.
    image_source: PreviewImageSourceField,
    generation_error_reason: GenerationErrorReasonField,
    // FEA-112: see hero.generation_pending.
    generation_pending: z.boolean().optional(),
    // FEA-114: see hero.image_category.
    image_category: ImageCategory.optional(),
  }),
  contact: z.object({
    phone: z.string().optional(),
    cta: z.string(),
  }),
  legal_footer: z.object({
    impressum: z.string().nullable(),
    datenschutz: z.string().nullable(),
  }),
  what_changed: z.array(z.string()),
  before: z.object({
    sections: z.array(SectionTaggedText),
    original_image_refs: z.array(z.string()),
  }),
});
export type PreviewJson = z.infer<typeof PreviewJson>;

// ---------------------------------------------------------------------------
// Progress step enums (plan §5.5, exact names)
// ---------------------------------------------------------------------------

export const AnalyzeProgressStep = z.enum([
  "reading_site",
  "collecting_images",
  "checking_local_search",
  "recalling_similar_audits",
  "experts_scoring",
  "building_channels",
  "done",
]);
export type AnalyzeProgressStep = z.infer<typeof AnalyzeProgressStep>;

export const ImproveProgressStep = z.enum([
  "rewriting_text",
  "generating_images",
  "assembling_preview",
  "done",
]);
export type ImproveProgressStep = z.infer<typeof ImproveProgressStep>;

/** Extension: not explicitly requested by name, but GET /api/audits/:id
 *  (§5.4) returns `progress[]` and F-044/F-065 need a shared shape for each
 *  entry to poll against — added so the API/UI contract doesn't need an
 *  ad-hoc shape invented later. */
export const ProgressEvent = z.object({
  step: z.union([AnalyzeProgressStep, ImproveProgressStep]),
  at: z.string(),
  detail: z.string().nullable(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;

// ---------------------------------------------------------------------------
// Assets (plan §5.3 `assets` table)
// ---------------------------------------------------------------------------

/** Extension: not one of the explicitly named exports, but needed to type
 *  the `assets` rows required by the F-081 fixture and shared by F-005
 *  (SQLite layer), F-026/F-041 (harvest/upload), F-051 (generated images).
 *  `status` is left as z.string() rather than an invented enum: the plan's
 *  §5.3 DDL declares `status TEXT NOT NULL` without enumerating values, and
 *  guessing one here would risk conflicting with Owner B's pipeline states. */
export const Asset = z.object({
  id: z.string(),
  audit_id: z.string(),
  kind: AssetKind,
  source: z.string().nullable(),
  storage_path: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  score: z.array(Criterion).nullable(), // I1-I6 sub-scores for scored kinds
  label: AssetLabel,
  status: z.string(),
});
export type Asset = z.infer<typeof Asset>;

// ---------------------------------------------------------------------------
// Fixture wrapper (plan F-081/F-082) — {business, report, assets, preview_json}
// ---------------------------------------------------------------------------

export const FixtureAudit = z.object({
  business: BusinessInput,
  report: Report,
  assets: z.array(Asset),
  preview_json: PreviewJson.nullable(),
});
export type FixtureAudit = z.infer<typeof FixtureAudit>;
