/**
 * F-054 — Preview assembly (plan §4.4). "The preview is never cut": this is
 * pure, synchronous, in-process DB reads plus deterministic string/shape
 * assembly — no model call, no network call, so it can always run, even mid
 * partial-failure, even in REPLAY. It reads whatever channels/assets exist
 * right now and produces a fully valid `PreviewJson` regardless of how much
 * of "Do It For You" actually completed (F-053's failure ladder degrades
 * gracefully into this function rather than needing special-casing here).
 */
import { getAudit, listAssets, listChannels, type AssetRecord, type ChannelRecord } from "../db";
import { pickBestExistingAsset } from "./image";
import {
  buildCandidates,
  categoryOf,
  collapseLineages,
  compositionPolicyFor,
  lineageRootOf,
  selectGallery,
  selectSlot,
  type CompositionCandidate,
} from "../images/taxonomy";
import { applyOneSourceOneTreatment, curateAfterOriginal } from "./curate";
import {
  ABOUT_TEXT_MAX,
  boundCardBody,
  boundCardTitle,
  boundText,
  HERO_SUBLINE_MAX,
  usableFallbackBody,
} from "./cardCopy";
import {
  PreviewJson,
  WebsiteEvidence,
  type AssetLabel,
  type BusinessInput,
  type GenerationErrorReason,
  type ImageCategory,
  type PreviewImageSource,
  type SectionTaggedText,
  type Trade,
} from "../schemas";

type PreviewServiceCard = { title: string; description: string };
type PreviewGalleryEntry = {
  asset_ref: string;
  label: AssetLabel;
  image_source?: PreviewImageSource;
  category?: ImageCategory;
};

// ---------------------------------------------------------------------------
// Defensive readers over loosely-typed DB JSON columns
// ---------------------------------------------------------------------------

/** `audits.evidence_json` is assembled by the analyze orchestrator (a
 *  different lane) as "WebsiteEvidence + GbpEvidence + TavilyFindability"
 *  (plan §5.3) — the exact combined shape isn't owned here, so this reads
 *  defensively: try the blob itself as `WebsiteEvidence`, then a nested
 *  `.website` key, else give up gracefully. A miss just means the preview's
 *  website-derived fields (before-panel sections, phone) fall back further
 *  down the chain — it never blocks assembly. */
function extractWebsiteEvidence(evidenceJson: unknown): WebsiteEvidence | null {
  if (!evidenceJson || typeof evidenceJson !== "object") return null;
  const direct = WebsiteEvidence.safeParse(evidenceJson);
  if (direct.success) return direct.data;
  const nested = (evidenceJson as Record<string, unknown>).website;
  if (nested) {
    const nestedParsed = WebsiteEvidence.safeParse(nested);
    if (nestedParsed.success) return nestedParsed.data;
  }
  return null;
}

function extractReputationChip(reportJson: unknown): string | null {
  const report = reportJson as { reputation_chips?: { review_count: number | null; rating: number | null } | null } | null;
  const chip = report?.reputation_chips;
  if (!chip) return null;
  if (chip.rating != null && chip.review_count != null) return `${chip.rating}★ (${chip.review_count} reviews)`;
  if (chip.rating != null) return `${chip.rating}★`;
  if (chip.review_count != null) return `${chip.review_count} reviews`;
  return null;
}

// ---------------------------------------------------------------------------
// Per-channel "what does this channel's current content say" readers
// ---------------------------------------------------------------------------

function isImproved(channel: ChannelRecord | undefined): channel is ChannelRecord {
  return channel?.status === "improved";
}

/** Text channels persist the FULL `RewriteOutput` shape as `after_json`
 *  (plan §4.2: `{channel_id, before_excerpt, after: {...}, rationale_one_liner}`
 *  — lib/improve/orchestrate.ts stores structuredCall's validated result
 *  as-is, unwrapped, so the frontend also gets `rationale_one_liner`/
 *  `before_excerpt` for the inline reveal). This unwraps to the inner
 *  channel-specific `after` object every text-field reader below needs. */
function extractRewriteAfter<T>(channel: ChannelRecord | undefined): T | null {
  if (!isImproved(channel)) return null;
  const wrapper = channel.after_json as { after?: T } | null;
  return wrapper?.after ?? null;
}

/** ISS-028: a whitelisted reason code for a failed generation, derived from
 *  the channel's own `after_json.generation_error` string. The raw provider
 *  message is deliberately NOT propagated into `preview_json` — it can carry
 *  local paths, model ids, and stack text, and the After renderer only needs
 *  to know which honest sentence to show. Unrecognized text degrades to
 *  "unknown" rather than leaking through. */
export function normalizeGenerationErrorReason(raw: unknown): GenerationErrorReason | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const text = raw.toLowerCase();
  if (text.includes("timed out") || text.includes("timeout")) return "timeout";
  if (text.includes("openai_api_key") || text.includes("api key")) return "missing_api_key";
  if (text.includes("no image data")) return "no_image_data";
  if (/rate limit|status code|\b4\d\d\b|\b5\d\d\b|api|network|connection|fetch failed|failed/.test(text)) return "api_error";
  return "unknown";
}

/** ISS-028: `resolveImageRef`'s answer plus WHICH rung of the F-053 ladder
 *  produced it, so the After renderer can never present a photo harvested from
 *  the customer's own website as this run's generated result. */
interface ResolvedImageRef {
  ref: string | null;
  image_source?: PreviewImageSource;
  generation_error_reason?: GenerationErrorReason;
  generation_pending?: boolean;
  image_category?: ImageCategory;
}

/** Resolves an image channel's current best image reference: the generated
 *  `ai_concept` asset if this run made one, else the best-existing real
 *  photo that channel picked at improve time, else (channel never improved,
 *  or has no ref recorded) the audit-wide best real photo — so the preview's
 *  hero/team image is never empty just because "Do It For You" hasn't run
 *  yet on that specific channel (F-054: the preview is never cut).
 *
 *  ISS-028: the fallback behavior itself is unchanged — what changes is that
 *  each rung is now REPORTED (`image_source`), together with a whitelisted
 *  `generation_error_reason` whenever the channel recorded a real generation
 *  failure. A silent fallback was indistinguishable from a real generation. */
function resolveImageRef(
  channel: ChannelRecord | undefined,
  // FEA-114: the fallback is no longer "the highest-scoring photo in the
  // audit" — it is the best photo OF THE RIGHT KIND for this slot, chosen by
  // the trade's slot priority (a hero slot wants premises or finished work, an
  // about slot wants the people). Passing it in keeps this function pure.
  slotFallback: AssetRecord | null,
  categoryById: Map<string, ImageCategory>,
): ResolvedImageRef {
  // FEA-112: an image channel that is still `improving` can already carry a
  // published STREAMED PARTIAL of its own generation. That is a real generated
  // image of this business, so the preview shows it immediately rather than the
  // customer's old photo — flagged `generation_pending` so the renderer can say
  // a sharper frame is still coming.
  const pending = channel?.status === "improving";
  const after =
    isImproved(channel) || pending
      ? (channel!.after_json as {
          generated_asset_id?: string | null;
          best_existing_asset_id?: string | null;
          generation_error?: string | null;
        } | null)
      : null;
  const reason = normalizeGenerationErrorReason(after?.generation_error);

  if (after?.generated_asset_id) {
    const category = categoryById.get(after.generated_asset_id);
    return {
      ref: after.generated_asset_id,
      image_source: "generated",
      ...(pending ? { generation_pending: true } : {}),
      ...(category ? { image_category: category } : {}),
    };
  }

  const fallbackRef = after?.best_existing_asset_id ?? slotFallback?.id ?? null;
  const pendingFlag = pending ? { generation_pending: true } : {};
  if (fallbackRef === null) {
    return { ref: null, ...(reason ? { generation_error_reason: reason } : {}), ...pendingFlag };
  }
  const category = categoryById.get(fallbackRef);
  return {
    ref: fallbackRef,
    image_source: "harvested_fallback",
    ...(reason ? { generation_error_reason: reason } : {}),
    ...pendingFlag,
    ...(category ? { image_category: category } : {}),
  };
}

function extractAboutText(channel: ChannelRecord | undefined): string | null {
  if (!channel) return null;
  const after = extractRewriteAfter<{ about_paragraph?: string }>(channel);
  if (after?.about_paragraph) return after.about_paragraph;
  const before = channel.before_json as { current_text?: string } | null;
  return before?.current_text ?? null;
}

function extractYearsPhrase(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(seit|since)\s+\d{4}/i);
  return match ? match[0] : null;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function resolveHero(
  headlineChannel: ChannelRecord | undefined,
  heroImageChannel: ChannelRecord | undefined,
  business: Partial<BusinessInput>,
  websiteEvidence: WebsiteEvidence | null,
  heroFallback: AssetRecord | null,
  categoryById: Map<string, ImageCategory>,
): PreviewJson["hero"] {
  const after = extractRewriteAfter<{ h1?: string; subline?: string; cta_text?: string }>(headlineChannel);

  const image = resolveImageRef(heroImageChannel, heroFallback, categoryById);
  return {
    h1: after?.h1 ?? websiteEvidence?.h1 ?? business.brand_name ?? "Your business",
    // ISS-036: the hero subline is one line, never the whole scraped homepage.
    subline: boundText(after?.subline ?? usableFallbackBody(business.background) ?? "Local, trusted, and ready to help.", HERO_SUBLINE_MAX),
    cta_text: after?.cta_text ?? "Contact us today.",
    hero_image_ref: image.ref,
    ...(image.image_source ? { image_source: image.image_source } : {}),
    ...(image.generation_error_reason ? { generation_error_reason: image.generation_error_reason } : {}),
    ...(image.generation_pending ? { generation_pending: true } : {}),
    ...(image.image_category ? { image_category: image.image_category } : {}),
  };
}

function resolveTrustBar(reportJson: unknown, businessDescChannel: ChannelRecord | undefined): PreviewJson["trust_bar"] {
  return {
    years_in_business: extractYearsPhrase(extractAboutText(businessDescChannel)),
    // Extension: no structured certification data exists anywhere in the
    // frozen contract (business input, evidence, or rewrite outputs) —
    // rather than guess, this is honestly empty until a real source exists.
    certifications: [],
    review_chip: extractReputationChip(reportJson),
  };
}

function buildServiceFillers(trade: Trade | undefined, background: string | undefined): PreviewServiceCard[] {
  const tradeLabel = !trade || trade === "other" ? "our services" : `our ${trade} services`;
  // ISS-036: the business's own free text may be a scraped homepage carrying
  // the form's internal "Business type: …" prefix. It is used ONLY when it
  // reads like copy, and always bounded — never pasted in raw.
  const ownWords = usableFallbackBody(background);
  return [
    {
      title: "Get in touch",
      description: ownWords
        ? boundCardBody(`${ownWords} Contact us to discuss your project and get a straightforward quote.`)
        : "Contact us to discuss your project and get a straightforward quote.",
    },
    {
      title: "Local & reliable",
      description: `We're a local team offering ${tradeLabel} — call or message us for details on what we can do for you.`,
    },
    {
      title: "Ask us anything",
      description: "Not sure exactly what you need? Reach out and we'll walk you through the options.",
    },
  ];
}

/** Plan §4.4: exactly 3 service cards, always. Uses the real rewrite when
 *  `services_copy` improved; otherwise pads honestly from the business's own
 *  background text and generic (non-fabricated) contact-oriented filler
 *  cards rather than inventing services the business never mentioned. */
function resolveServices(channel: ChannelRecord | undefined, business: Partial<BusinessInput>): PreviewJson["services"] {
  const cards: PreviewServiceCard[] = [];

  // ISS-036: every card — model output included — is bounded and stripped of
  // internal scaffolding. A rewrite that runs long is trimmed at a sentence
  // boundary rather than allowed to break the layout.
  const after = extractRewriteAfter<{ services?: { service_name: string; description: string }[] }>(channel);
  for (const service of after?.services ?? []) {
    cards.push({ title: boundCardTitle(service.service_name), description: boundCardBody(service.description) });
  }

  if (cards.length === 0) {
    // ISS-036: `before_json.current_text` is the RAW scraped services block —
    // it is the customer's current copy, not marketing copy, so it is only
    // admitted when it already reads like a card.
    const before = channel?.before_json as { current_text?: string } | null;
    const ownWords = usableFallbackBody(before?.current_text);
    if (ownWords) cards.push({ title: "Our services", description: boundCardBody(ownWords) });
  }

  const fillers = buildServiceFillers(business.trade, business.background);
  let fillerIndex = 0;
  while (cards.length < 3) {
    cards.push(fillers[fillerIndex % fillers.length]!);
    fillerIndex++;
  }

  return cards.slice(0, 3) as PreviewJson["services"];
}

function resolveAboutTeam(
  descChannel: ChannelRecord | undefined,
  teamImageChannel: ChannelRecord | undefined,
  business: Partial<BusinessInput>,
  teamFallback: AssetRecord | null,
  categoryById: Map<string, ImageCategory>,
): PreviewJson["about_team"] {
  // ISS-036: an About paragraph may be a paragraph — but not a whole scraped
  // page, and never with the form's internal prefix in front of it.
  const text = boundText(
    extractAboutText(descChannel) ?? business.background ?? `${business.brand_name ?? "We"} are a local, trusted team ready to help.`,
    ABOUT_TEXT_MAX,
  );
  const image = resolveImageRef(teamImageChannel, teamFallback, categoryById);
  return {
    text,
    team_image_ref: image.ref,
    ...(image.image_source ? { image_source: image.image_source } : {}),
    ...(image.generation_error_reason ? { generation_error_reason: image.generation_error_reason } : {}),
    ...(image.generation_pending ? { generation_pending: true } : {}),
    ...(image.image_category ? { image_category: image.image_category } : {}),
  };
}

function resolveContact(
  ctaChannel: ChannelRecord | undefined,
  napChannel: ChannelRecord | undefined,
  websiteEvidence: WebsiteEvidence | null,
): PreviewJson["contact"] {
  const napAfter = extractRewriteAfter<{ phone?: string }>(napChannel);
  let phone: string | undefined = napAfter?.phone;
  if (!phone && websiteEvidence?.tel_links?.[0]) {
    phone = websiteEvidence.tel_links[0].replace(/^tel:/i, "");
  }

  const ctaAfter = extractRewriteAfter<{ cta_text?: string }>(ctaChannel);
  const cta = ctaAfter?.cta_text ?? "Contact us today.";

  return phone ? { phone, cta } : { cta };
}

function resolveLegalFooter(channel: ChannelRecord | undefined): PreviewJson["legal_footer"] {
  const after = extractRewriteAfter<{ footer_text?: string; checklist?: string[] }>(channel);
  if (after) {
    return {
      impressum: after.footer_text ?? null,
      datenschutz: Array.isArray(after.checklist) && after.checklist.length > 0 ? after.checklist.join("; ") : null,
    };
  }
  const before = channel?.before_json as { has_impressum?: boolean; has_datenschutz?: boolean } | null;
  return {
    impressum: before?.has_impressum ? "Present." : null,
    datenschutz: before?.has_datenschutz ? "Present." : null,
  };
}

const GALLERY_CAP = 8;

/** Work-proof gallery (plan §4.4): generated concept images (badged via
 *  `label`) beside the FEW originals worth showing. ISS-017: the After gallery
 *  is new-by-default — generated concepts and enhanced images are always kept,
 *  but an ORIGINAL (harvested/uploaded) photo is admitted only when it clears
 *  the ISS-017 curation policy (`curateAfterOriginal`): past the ISS-014 logo
 *  gate AND either a high-value real photo or a credential asset. Weak, small,
 *  or unscored originals are dropped here (they still appear in the Before
 *  panel). Pulls the hero/team/work-proof channels' resolved refs first (in
 *  that order, deduped), then fills any remaining slots with other admissible
 *  real photos. */
function resolveGallery(
  channelById: Map<string, ChannelRecord>,
  assets: AssetRecord[],
  trade: Trade | undefined,
  // ISS-035: content already shown by the hero / about slots. The same picture
  // must not appear a second time further down the page — in the reported
  // defect the hero and two gallery tiles were all the same source image.
  usedRefs: readonly (string | null)[],
): PreviewJson["gallery"] {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const admissible: AssetRecord[] = [];
  const seen = new Set<string>();

  function admit(ref: string | null | undefined): void {
    if (!ref || seen.has(ref)) return;
    const asset = assetById.get(ref);
    if (!asset) return;
    // ISS-017: an ORIGINAL photo enters the After gallery only if curated in;
    // generated concepts/enhanced images always pass.
    if (asset.kind === "harvested_image" || asset.kind === "uploaded_image") {
      if (!curateAfterOriginal(asset).include) return;
    }
    seen.add(ref);
    admissible.push(asset);
  }

  // Channel-produced images first: they are this run's own output, so they are
  // the strongest candidates before the category quota is applied.
  for (const channelId of ["hero_image", "team_image", "work_proof_images"] as const) {
    const channel = channelById.get(channelId);
    // FEA-112: an in-flight channel may already hold its streamed partial.
    const usable = channel && (channel.status === "improved" || channel.status === "improving");
    const after = usable
      ? (channel.after_json as { generated_asset_id?: string | null; best_existing_asset_id?: string | null } | null)
      : null;
    admit(after?.generated_asset_id ?? null);
    admit(after?.best_existing_asset_id ?? null);
  }

  const imageFixes = channelById.get("image_fixes");
  const imageFixesAfter = isImproved(imageFixes)
    ? (imageFixes.after_json as { enhanced_asset_id?: string | null; source_asset_id?: string | null } | null)
    : null;
  admit(imageFixesAfter?.enhanced_asset_id ?? null);
  admit(imageFixesAfter?.source_asset_id ?? null);

  // FEA-117: gallery fillers belong to no channel — they exist precisely to
  // fill the gallery, so they are admitted directly.
  for (const asset of assets) {
    if (asset.kind === "generated_image" && (asset.meta_json as { gallery_filler?: unknown } | null)?.gallery_filler === true) {
      admit(asset.id);
    }
  }

  for (const asset of assets) {
    if (asset.kind === "harvested_image" || asset.kind === "uploaded_image") admit(asset.id);
  }

  // FEA-114: the actual composition decision. Admissible images are grouped by
  // what they SHOW and filled round-robin under this trade's per-category
  // quota, so the gallery is diverse by construction instead of "whatever
  // ranked highest" — which is how four slots ended up holding three
  // team-in-front-of-the-van photos.
  const policy = compositionPolicyFor(trade);
  const candidates: CompositionCandidate[] = buildCandidates(admissible);
  const excludeLineages = new Set<string>();
  for (const ref of usedRefs) {
    const asset = ref ? assetById.get(ref) : null;
    if (asset) excludeLineages.add(lineageRootOf(asset));
  }
  const decisions = selectGallery(candidates, policy, GALLERY_CAP, { exclude_lineages: excludeLineages });

  const entries: PreviewGalleryEntry[] = decisions.map((decision) => {
    const asset = assetById.get(decision.asset_id);
    const label: AssetLabel = asset?.label === "ai_concept" || asset?.label === "enhanced" ? asset.label : null;
    const image_source: PreviewImageSource | undefined =
      asset?.kind === "generated_image"
        ? "generated"
        : asset?.kind === "harvested_image" || asset?.kind === "uploaded_image"
          ? "harvested_fallback"
          : undefined;
    return {
      asset_ref: decision.asset_id,
      label,
      ...(image_source ? { image_source } : {}),
      category: decision.category,
    };
  });

  // ISS-019: one source, one treatment — drop a garbled enhanced (text-heavy
  // edit source) and never show a source both enhanced and raw.
  return applyOneSourceOneTreatment(entries, assetById);
}

/** FEA-114: the composition decisions behind the current gallery, for
 *  inspection/logging (`lib/improve/orchestrate.ts` writes a one-line summary
 *  into the audit's progress events at final assembly). Recomputed from the
 *  same pure functions the assembly uses, so it can never drift from what was
 *  actually rendered. */
export function explainComposition(auditId: string): { slot: string; asset_id: string; category: ImageCategory; reason: string }[] {
  const audit = getAudit(auditId);
  if (!audit) return [];
  const business = (audit.business_json ?? {}) as Partial<BusinessInput>;
  const preview = audit.preview_json as PreviewJson | null;
  const assetById = new Map(listAssets(auditId).map((a) => [a.id, a]));
  const policy = compositionPolicyFor(business.trade);
  const out: { slot: string; asset_id: string; category: ImageCategory; reason: string }[] = [];

  if (preview?.hero?.hero_image_ref) {
    const asset = assetById.get(preview.hero.hero_image_ref);
    out.push({
      slot: "hero",
      asset_id: preview.hero.hero_image_ref,
      category: preview.hero.image_category ?? (asset ? categoryOf(asset).category : "other"),
      reason: preview.hero.image_source === "generated" ? "generated for the hero slot" : `harvested fallback under hero priority ${policy.hero_priority.join(" > ")}`,
    });
  }
  if (preview?.about_team?.team_image_ref) {
    const asset = assetById.get(preview.about_team.team_image_ref);
    out.push({
      slot: "about_team",
      asset_id: preview.about_team.team_image_ref,
      category: preview.about_team.image_category ?? (asset ? categoryOf(asset).category : "other"),
      reason: preview.about_team.image_source === "generated" ? "generated for the team slot" : `harvested fallback under team priority ${policy.team_priority.join(" > ")}`,
    });
  }
  for (const [i, tile] of (preview?.gallery ?? []).entries()) {
    const asset = assetById.get(tile.asset_ref);
    const category = tile.category ?? (asset ? categoryOf(asset).category : "other");
    out.push({
      slot: `gallery_${i}`,
      asset_id: tile.asset_ref,
      category,
      reason: `quota ${policy.gallery_quota[category] ?? 1} for ${category}; priority ${policy.gallery_priority.indexOf(category) + 1}`,
    });
  }
  return out;
}

/** Before panel (plan §4.4/F-075): honest as-is facsimile from the original
 *  extracted text sections + harvested/uploaded image refs, "what customers
 *  see today". Falls back to manually pasted text as a single section when
 *  no website was reachable, so a text-only audit still has a Before panel. */
function resolveBefore(
  websiteEvidence: WebsiteEvidence | null,
  business: Partial<BusinessInput>,
  assets: AssetRecord[],
): PreviewJson["before"] {
  let sections: SectionTaggedText[] = websiteEvidence?.visible_text ?? [];
  if (sections.length === 0 && business.pasted_text) {
    sections = [{ section: "hero", text: business.pasted_text }];
  }
  const original_image_refs = assets
    .filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image")
    .map((a) => a.id);
  return { sections, original_image_refs };
}

/** Accurate "what changed" list (plan §4.4/F-054) — derived ONLY from
 *  channels whose DB status is actually "improved", never from intent. */
function resolveWhatChanged(channels: ChannelRecord[]): string[] {
  const improved = new Set(channels.filter((c) => c.status === "improved").map((c) => c.id));
  const changed: string[] = [];

  if (improved.has("hero_headline")) changed.push("Headline rewritten");
  if (improved.has("business_description")) changed.push("About section rewritten");
  if (improved.has("services_copy")) changed.push("Services descriptions rewritten");
  if (improved.has("cta_contact")) changed.push("Call-to-action added");
  if (improved.has("legal_footer")) changed.push("Impressum & Datenschutz guidance added");
  if (improved.has("platform_consistency")) changed.push("Name, phone & address corrected across platforms");

  let generatedCount = 0;
  for (const channelId of ["hero_image", "team_image", "work_proof_images"] as const) {
    if (!improved.has(channelId)) continue;
    const channel = channels.find((c) => c.id === channelId)!;
    const after = channel.after_json as { generated_asset_id?: string | null } | null;
    if (after?.generated_asset_id) generatedCount++;
  }
  if (generatedCount > 0) {
    changed.push(`${generatedCount} image${generatedCount === 1 ? "" : "s"} upgraded (AI concept${generatedCount === 1 ? "" : "s"})`);
  }
  if (improved.has("image_fixes")) {
    const channel = channels.find((c) => c.id === "image_fixes")!;
    const after = channel.after_json as { enhanced_asset_id?: string | null } | null;
    changed.push(after?.enhanced_asset_id ? "1 real photo enhanced" : "Photo fix instructions added");
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Assembles `preview_json` purely from current DB state (plan §4.4, F-054).
 *  Never fails on partial improvement — every field has an honest fallback,
 *  so this can be called after "Do It For You" completes, after a single
 *  channel improves, after a partial failure, or in REPLAY, and always
 *  returns a fully schema-valid `PreviewJson`. */
export function assemblePreview(auditId: string): PreviewJson {
  const audit = getAudit(auditId);
  if (!audit) {
    throw new Error(`assemblePreview: no audit found with id "${auditId}".`);
  }

  const business = (audit.business_json ?? {}) as Partial<BusinessInput>;
  const channels = listChannels(auditId);
  const assets = listAssets(auditId);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const websiteEvidence = extractWebsiteEvidence(audit.evidence_json);

  // FEA-114: per-slot fallbacks chosen by what the image SHOWS, under this
  // trade's slot priorities — not one global "best photo" for every slot.
  const realPhotos = assets.filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image");
  const policy = compositionPolicyFor(business.trade);
  // ISS-035: a slot's fallback considers ENHANCED variants too, collapsed to
  // one best version per piece of content — otherwise the About section shows
  // the raw original while the gallery shows its enhanced twin, which is the
  // same duplication seen in the report, one slot apart.
  const enhancedVariants = assets.filter(
    (a) => a.kind === "generated_image" && a.label === "enhanced" && typeof (a.meta_json as { source_asset_id?: unknown } | null)?.source_asset_id === "string",
  );
  const slotCandidates = collapseLineages(buildCandidates([...realPhotos, ...enhancedVariants]));
  const heroDecision = selectSlot(slotCandidates, policy.hero_priority, "hero");
  const teamDecision = selectSlot(slotCandidates, policy.team_priority, "team");
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const heroFallback = heroDecision ? (assetById.get(heroDecision.asset_id) ?? null) : pickBestExistingAsset(auditId);
  const teamFallback = teamDecision ? (assetById.get(teamDecision.asset_id) ?? null) : pickBestExistingAsset(auditId);
  const categoryById = new Map(assets.map((a) => [a.id, categoryOf(a).category]));

  const hero = resolveHero(
      channelById.get("hero_headline"),
      channelById.get("hero_image"),
      business,
      websiteEvidence,
      heroFallback,
      categoryById,
  );
  const aboutTeam = resolveAboutTeam(
    channelById.get("business_description"),
    channelById.get("team_image"),
    business,
    teamFallback,
    categoryById,
  );

  const preview: PreviewJson = {
    header: { business_name: business.brand_name ?? "Your business" },
    hero,
    trust_bar: resolveTrustBar(audit.report_json, channelById.get("business_description")),
    services: resolveServices(channelById.get("services_copy"), business),
    // ISS-035: the gallery never repeats what the hero or the about section
    // already showed (including an edited variant of the same photo).
    gallery: resolveGallery(channelById, assets, business.trade, [hero.hero_image_ref, aboutTeam.team_image_ref]),
    about_team: aboutTeam,
    contact: resolveContact(channelById.get("cta_contact"), channelById.get("platform_consistency"), websiteEvidence),
    legal_footer: resolveLegalFooter(channelById.get("legal_footer")),
    what_changed: resolveWhatChanged(channels),
    before: resolveBefore(websiteEvidence, business, assets),
  };

  // Runtime safety net: guarantees the caller always gets a genuinely valid
  // PreviewJson, not just a same-shaped object (F-054 acceptance).
  return PreviewJson.parse(preview);
}
