/**
 * Deterministic Rubric Engine (F-010..F-017). Pure TypeScript, zero model calls.
 *
 * Source: docs/team-idea/final-implement-plan/impelemet-plan.md §2 (scoring framework).
 * Contract: models (Copy Strategist / Visual Director, see lib/schemas.ts
 * `CopyStrategistOutput` / `VisualDirectorOutput`) only ever emit per-criterion
 * 0-5 sub-scores + quoted evidence. This module is the ONLY place totals,
 * bands, findings, channels, and priority are computed. `buildReport` is the
 * single entry point the wave-2 orchestrator calls; its output is the full
 * `Report` shape minus the two Synthesizer-owned fields (`executive_summary`,
 * `memory_note`) — the orchestrator layers those on top untouched (F-034: the
 * Synthesizer may not alter any number).
 */
import type {
  Asset,
  BusinessInput,
  Channel,
  ChannelId,
  Criterion,
  CopyStrategistOutput,
  Finding,
  GbpEvidence,
  PortalEvidence,
  Report,
  TavilyFindability,
  VisualDirectorOutput,
  WebsiteEvidence,
} from "./schemas";

// ---------------------------------------------------------------------------
// F-010 · Rubric constants
// ---------------------------------------------------------------------------

export interface RubricCriterionDef {
  id: string;
  label: string;
  weight: number; // percentage points, sums to 100 within a lane
  anchor: string; // "what 5/5 looks like", verbatim from plan §2.2/§2.3
}

/** Text rubric — plan §2.2. Weights sum to 100. */
export const TEXT_CRITERIA: readonly RubricCriterionDef[] = [
  {
    id: "T1",
    label: "Value clarity / above-the-fold promise",
    weight: 20,
    anchor: "Trade + area + specialty answered in the first visible sentence",
  },
  {
    id: "T2",
    label: "CTA presence & specificity",
    weight: 15,
    anchor: '"Call now — we answer within 2 hours", not "learn more"',
  },
  {
    id: "T3",
    label: "Trust elements",
    weight: 15,
    anchor: "Meisterbetrieb / years / certifications / real guarantees",
  },
  {
    id: "T4",
    label: "Local relevance",
    weight: 15,
    anchor: "City, region, radius, local landmarks in the copy",
  },
  {
    id: "T5",
    label: "Contact conversion path",
    weight: 10,
    anchor: "Phone visible in header/footer text, hours listed, form ≤5 fields",
  },
  {
    id: "T6",
    label: "Readability",
    weight: 10,
    anchor: "Short sentences, zero jargon, scannable structure",
  },
  {
    id: "T7",
    label: "Correctness & compliance",
    weight: 10,
    anchor:
      'No spelling errors; red flags: "100% guaranteed", unverifiable superlatives; for doctors ' +
      "additionally: health-claim caution (DE Heilmittelwerbegesetz sensitivity — ASSUMPTION-level " +
      "heuristic, flagged not lawyered)",
  },
  {
    id: "T8",
    label: "Legal hygiene",
    weight: 5,
    anchor: "Impressum + Datenschutz present (mandatory in DE; missing = instant high finding)",
  },
];

/** Image rubric — plan §2.3. Weights sum to 100. Applied per image, then
 *  averaged across the scored image set before weighting (F-011). */
export const IMAGE_CRITERIA: readonly RubricCriterionDef[] = [
  {
    id: "I1",
    label: "Technical quality",
    weight: 20,
    anchor: "Sharp, well-exposed, ≥1080px long edge",
  },
  {
    id: "I2",
    label: "Subject & authenticity",
    weight: 20,
    anchor: "Real team/real jobs, human faces, recognizably local",
  },
  {
    id: "I3",
    label: "Job-proof value",
    weight: 20,
    anchor: "Before/after pairs, process shots, finished work",
  },
  {
    id: "I4",
    label: "Composition & framing",
    weight: 15,
    anchor: "Clean background, deliberate framing, thumbnail-legible",
  },
  {
    id: "I5",
    label: "Platform fit",
    weight: 15,
    anchor: "Correct aspect, text overlay <20% of area",
  },
  {
    id: "I6",
    label: "Branding & trust",
    weight: 10,
    anchor: "Logo/uniform/vehicle branding, consistent",
  },
];

export interface ScoreBand {
  min: number; // inclusive
  max: number; // inclusive
  label: string;
}

/** Score bands — plan §2.1, unchanged from v1. */
export const BANDS: readonly ScoreBand[] = [
  { min: 85, max: 100, label: "Market Leader" },
  { min: 70, max: 84, label: "Strong" },
  { min: 50, max: 69, label: "At Risk" },
  { min: 30, max: 49, label: "Weak" },
  { min: 0, max: 29, label: "Invisible" },
];

export function bandFor(score: number): string {
  const band = BANDS.find((b) => score >= b.min && score <= b.max);
  // Defensive fallback only — BANDS covers the full 0-100 domain.
  return band ? band.label : score >= 100 ? "Market Leader" : "Invisible";
}

export interface ChannelCatalogEntry {
  id: ChannelId;
  lane: Channel["lane"];
  title: string;
  improve_promise: string;
}

/** Fixed 12-channel catalog — plan §2.5. Order here is catalog order, not
 *  priority order; `orderChannels` computes actual row order. */
export const CHANNEL_CATALOG: readonly ChannelCatalogEntry[] = [
  {
    id: "hero_headline",
    lane: "text",
    title: "Headline & first impression",
    improve_promise: "New H1 + subline + CTA button text",
  },
  {
    id: "business_description",
    lane: "text",
    title: "About / business description",
    improve_promise: "Rewritten about paragraph + GBP description (≤750 chars, DE+EN)",
  },
  {
    id: "services_copy",
    lane: "text",
    title: "Services descriptions",
    improve_promise: "Per-service rewrite with local keywords",
  },
  {
    id: "cta_contact",
    lane: "text",
    title: "Call-to-action & contact path",
    improve_promise: "CTA copy + contact block layout text",
  },
  {
    id: "legal_footer",
    lane: "text",
    title: "Legal footer (Impressum/Datenschutz)",
    improve_promise: "Checklist + footer text template",
  },
  {
    id: "platform_consistency",
    lane: "text",
    title: "Name, phone & address consistency",
    improve_promise: "Corrected NAP block to use identically on website, Maps, and every portal",
  },
  {
    id: "hero_image",
    lane: "image",
    title: "Main photo",
    improve_promise: "gpt-image-2 concept hero image (labeled) + shot brief for the real photo",
  },
  {
    id: "work_proof_images",
    lane: "image",
    title: "Work & before/after photos",
    improve_promise: "Concept images + 10-shot list tailored to trade",
  },
  {
    id: "team_image",
    lane: "image",
    title: "Team / owner photo",
    improve_promise: "Concept image + shot brief",
  },
  {
    id: "image_fixes",
    lane: "image",
    title: "Fix existing photos",
    improve_promise: "Per-photo instructions (crop/relight/replace); P1: gpt-image-2 edit of the real photo",
  },
  {
    id: "optimized_site",
    lane: "site",
    title: "Your optimized website",
    improve_promise: "The full Before/After one-page preview (assembled from all improved channels)",
  },
  {
    id: "promo_video",
    lane: "video",
    title: "Promo video",
    improve_promise: "Coming soon — disabled row, roadmap tooltip",
  },
];

const CATALOG_BY_ID: Record<ChannelId, ChannelCatalogEntry> = Object.fromEntries(
  CHANNEL_CATALOG.map((c) => [c.id, c]),
) as Record<ChannelId, ChannelCatalogEntry>;

// ---------------------------------------------------------------------------
// Criterion → channel mapping (F-015)
//
// Frozen `Finding`/`ModelFinding` carry a criterion id but no channel — this
// module owns the mapping. Documented explicitly because the plan's §2.5
// table names channels by *outcome* ("Improve It produces...") not by
// criterion id, so several reasonable groupings exist; this is the one this
// engine implements and tests against.
//
// | Source                                   | Channel                |
// |-------------------------------------------|-------------------------|
// | T1 (value clarity / above-the-fold)        | hero_headline           |
// | T2 (CTA presence & specificity)            | cta_contact             |
// | T3 (trust elements)                        | business_description    |
// | T4 (local relevance)                       | services_copy           |
// | T5 (contact conversion path)               | cta_contact             |
// | T6 (readability)                           | business_description    |
// | T7 (correctness & compliance)              | services_copy           |
// | T8 (legal hygiene)                         | legal_footer            |
// | nap_consistency (deterministic, F-017)     | platform_consistency    |
// | I3 (job-proof value, low score)            | work_proof_images       |
// | I1/I2/I4/I5/I6 (existing-photo quality)    | image_fixes             |
// | red flag (hard image issue)                | image_fixes             |
// | coverage gap: hero_shot                    | hero_image              |
// | coverage gap: team_shot                    | team_image              |
// | coverage gap: work_proof_shot              | work_proof_images       |
// | coverage gap: branding_shot                | image_fixes             |
//
// Rationale for the split points: T2 and T5 are both "how does a customer
// reach you" concerns and share one rewrite (CTA copy + contact block, plan
// §4.2) — both route to `cta_contact`. T3/T6 are narrative-quality concerns
// best carried by the about-paragraph rewrite; T4/T7 are per-service
// concerns (local keywords, correctness of service claims) best carried by
// the services rewrite. For images, I3 is literally "work/before-after
// proof", the exact promise of `work_proof_images`; the remaining five
// per-image criteria (I1/I2/I4/I5/I6) are generic "this existing photo has a
// technical/authenticity/composition/branding problem" — exactly what
// `image_fixes` ("crop/relight/replace" instructions) promises to fix.
// `hero_image`/`team_image`/`work_proof_images` are reserved for *coverage*
// (a shot category is missing outright), which is the only signal that
// identifies an image's role — no per-image "this is the hero shot" tag
// exists in `VisualDirectorOutput`.
// ---------------------------------------------------------------------------

const TEXT_CRITERION_CHANNEL: Record<string, ChannelId> = {
  T1: "hero_headline",
  T2: "cta_contact",
  T3: "business_description",
  T4: "services_copy",
  T5: "cta_contact",
  T6: "business_description",
  T7: "services_copy",
  T8: "legal_footer",
};

const IMAGE_CRITERION_CHANNEL: Record<string, ChannelId> = {
  I1: "image_fixes",
  I2: "image_fixes",
  I3: "work_proof_images",
  I4: "image_fixes",
  I5: "image_fixes",
  I6: "image_fixes",
};

const COVERAGE_GAP_CHANNEL: Record<string, ChannelId> = {
  hero_shot: "hero_image",
  team_shot: "team_image",
  work_proof_shot: "work_proof_images",
  branding_shot: "image_fixes",
};

const ALL_COVERAGE_GAPS = ["hero_shot", "team_shot", "work_proof_shot", "branding_shot"] as const;

// ---------------------------------------------------------------------------
// Shared absence/severity helpers
// ---------------------------------------------------------------------------

const SITE_UNREACHABLE_EVIDENCE =
  "site unreachable — that is what your customer sees too.";
const NO_TEXT_EVIDENCE =
  "No text evidence available anywhere (no website, no portal listing, no pasted text) — " +
  "site unreachable — that is what your customer sees too.";
const NO_IMAGES_EVIDENCE =
  "No photos were found for this business — no website images, no uploads. " +
  "That absence is itself what a searching customer sees.";

function makeAbsentCriterion(id: string, evidence: string): Criterion {
  return { id, score: 0, evidence, source: "absent" };
}

/** Severity fallback when no model-supplied severity is available: a 0/1
 *  sub-score is always `high`, a 2 is `medium` (the threshold for a finding
 *  to exist at all — see `TEXT_CRITERIA`/`IMAGE_CRITERIA` callers). */
function severityFromScore(score: number): Finding["severity"] {
  return score <= 1 ? "high" : "medium";
}

/** impact/effort are model-supplied per `ModelFinding` (text lane only) and
 *  feed `priority = impact² / effort` (F-016). Images and rubric-generated
 *  findings (NAP, coverage gaps, absence, Impressum/Datenschutz) have no
 *  model-supplied impact/effort, so this engine assigns deterministic
 *  defaults from severity — documented here so tests can hand-compute
 *  expected priorities without guessing.
 *  high -> impact 5, medium -> impact 3, low -> impact 1; effort default 2,
 *  except the Impressum/Datenschutz instant-high finding (effort 1: adding
 *  two legal pages is cheap) and coverage gaps (effort 3: needs a photoshoot). */
const DEFAULT_IMPACT_BY_SEVERITY: Record<Finding["severity"], number> = {
  high: 5,
  medium: 3,
  low: 1,
};
const DEFAULT_EFFORT = 2;
const IMPRESSUM_EFFORT = 1;
const COVERAGE_GAP_EFFORT = 3;

/** Internal-only impact/effort carried alongside a Finding while computing
 *  channel priority. Not part of the frozen `Finding` schema (F-016: the
 *  numbers are consumed, never stored on the finding). */
interface ScoredFinding {
  finding: Finding;
  impact: number;
  effort: number;
}

// ---------------------------------------------------------------------------
// F-011 · Lane scoring math
// ---------------------------------------------------------------------------

/** `Σ (criterion_score / 5 × weight)`, rounded to an integer (plan §2.1). */
export function textLaneScore(criteria: readonly Criterion[]): number {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  let sum = 0;
  for (const def of TEXT_CRITERIA) {
    const score = byId.get(def.id)?.score ?? 0;
    sum += (score / 5) * def.weight;
  }
  return Math.round(sum);
}

/** Image lane: average each I-criterion across all scored assets, then
 *  weight (plan F-011). Zero assets/criteria for a given criterion id ->
 *  that criterion averages to 0 (absence), matching "zero assets -> all
 *  I-criteria 0 from absence". */
export function imageLaneScore(criteriaByAsset: Record<string, readonly Criterion[]>): number {
  const assetCriteria = Object.values(criteriaByAsset);
  let sum = 0;
  for (const def of IMAGE_CRITERIA) {
    const scores: number[] = [];
    for (const criteria of assetCriteria) {
      const match = criteria.find((c) => c.id === def.id);
      if (match) scores.push(match.score);
    }
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    sum += (avg / 5) * def.weight;
  }
  return Math.round(sum);
}

// ---------------------------------------------------------------------------
// F-012 · Overall score + band
// ---------------------------------------------------------------------------

/** `OverallScore = 50% Text + 50% Image`, integer + band (plan §2.1).
 *  Models never supply totals; this is the only place a total is computed. */
export function overallScore(textScore: number, imageScoreValue: number): { overall_score: number; band: string } {
  const overall = Math.round(0.5 * textScore + 0.5 * imageScoreValue);
  return { overall_score: overall, band: bandFor(overall) };
}

// ---------------------------------------------------------------------------
// F-013 · Text findings derivation
// ---------------------------------------------------------------------------

/** Resolves the T1-T8 criteria array to score from, applying the absence
 *  rules documented at the top of this file:
 *  (A) no text evidence anywhere (`copyOutput` null) -> all 8 criteria
 *      score 0/absent with the site-unreachable phrasing.
 *  (B)/(C) `copyOutput` present -> use its criteria as-is; if the
 *      business's own website specifically could not be reached
 *      (`websiteEvidence` null) while other text evidence let the model
 *      run, T1's evidence is still force-set to the exact
 *      "site unreachable" phrase after finding derivation (see
 *      `applyWebsiteUnreachableOverride`), since T1 ("above-the-fold
 *      promise") is definitionally about the business's own homepage. */
function resolveTextCriteria(
  copyOutput: CopyStrategistOutput | null,
  websiteEvidence: WebsiteEvidence | null,
): Criterion[] {
  if (!copyOutput) {
    const evidence = websiteEvidence === null ? NO_TEXT_EVIDENCE : SITE_UNREACHABLE_EVIDENCE;
    return TEXT_CRITERIA.map((def) => makeAbsentCriterion(def.id, evidence));
  }
  // Defensive: fill any criterion the model omitted with absence rather
  // than silently treating it as a perfect (undefined -> 0 in scoring) or
  // crashing — a malformed model output should degrade honestly, not hide.
  const byId = new Map(copyOutput.criteria.map((c) => [c.id, c]));
  return TEXT_CRITERIA.map(
    (def) => byId.get(def.id) ?? makeAbsentCriterion(def.id, "Model did not return this criterion."),
  );
}

function deriveTextFindings(
  criteria: readonly Criterion[],
  modelFindings: CopyStrategistOutput["findings"],
): ScoredFinding[] {
  const modelByCriterion = new Map(modelFindings.map((f) => [f.criterion, f]));
  const out: ScoredFinding[] = [];
  for (const def of TEXT_CRITERIA) {
    const criterion = criteria.find((c) => c.id === def.id);
    if (!criterion || criterion.score > 2) continue;
    const modelFinding = modelByCriterion.get(def.id);
    const severity = modelFinding?.severity ?? severityFromScore(criterion.score);
    const evidence_quote = modelFinding?.evidence_quote || criterion.evidence || `No evidence for ${def.id}.`;
    out.push({
      finding: {
        id: `f-${def.id.toLowerCase()}`,
        lane: "text",
        criterion: def.id,
        severity,
        evidence_quote,
        asset_ref: null,
      },
      impact: modelFinding?.impact ?? DEFAULT_IMPACT_BY_SEVERITY[severity],
      effort: modelFinding?.effort ?? DEFAULT_EFFORT,
    });
  }
  return out;
}

/** F-013 stop-ship: missing Impressum/Datenschutz is an instant `high` T8
 *  finding regardless of what the model scored T8 — overrides (does not
 *  duplicate) whatever T8 finding `deriveTextFindings` produced. Only fires
 *  when the website itself was reachable (a null `websiteEvidence` already
 *  produces a high-severity T8 finding via the absence path above). */
function applyImpressumOverride(findings: ScoredFinding[], websiteEvidence: WebsiteEvidence | null): void {
  if (!websiteEvidence) return;
  const missingImpressum = !websiteEvidence.has_impressum;
  const missingDatenschutz = !websiteEvidence.has_datenschutz;
  if (!missingImpressum && !missingDatenschutz) return;

  const evidence_quote =
    missingImpressum && missingDatenschutz
      ? "No Impressum or Datenschutz found on the site — both are legally required in Germany."
      : missingImpressum
        ? "No Impressum found on the site."
        : "No Datenschutz page found on the site.";

  const scored: ScoredFinding = {
    finding: {
      id: "f-t8",
      lane: "text",
      criterion: "T8",
      severity: "high",
      evidence_quote,
      asset_ref: null,
    },
    impact: DEFAULT_IMPACT_BY_SEVERITY.high,
    effort: IMPRESSUM_EFFORT,
  };
  const idx = findings.findIndex((f) => f.finding.criterion === "T8");
  if (idx >= 0) findings[idx] = scored;
  else findings.push(scored);
}

/** F-022: when the business's own website could not be reached but other
 *  text evidence let the Copy Strategist run anyway, force T1's evidence to
 *  the exact required phrase — see `resolveTextCriteria` doc. No-op when
 *  `copyOutput` was already null (rule A already used this exact phrase). */
function applyWebsiteUnreachableOverride(
  findings: ScoredFinding[],
  copyOutput: CopyStrategistOutput | null,
  websiteEvidence: WebsiteEvidence | null,
): void {
  if (websiteEvidence !== null || copyOutput === null) return;
  const scored: ScoredFinding = {
    finding: {
      id: "f-t1",
      lane: "text",
      criterion: "T1",
      severity: "high",
      evidence_quote: SITE_UNREACHABLE_EVIDENCE,
      asset_ref: null,
    },
    impact: DEFAULT_IMPACT_BY_SEVERITY.high,
    effort: DEFAULT_EFFORT,
  };
  const idx = findings.findIndex((f) => f.finding.criterion === "T1");
  if (idx >= 0) findings[idx] = scored;
  else findings.push(scored);
}

// ---------------------------------------------------------------------------
// F-013/F-014 · Image findings + coverage derivation
// ---------------------------------------------------------------------------

interface ImageLaneResult {
  criteriaByAsset: Record<string, Criterion[]>;
  coverageGaps: string[];
  findings: ScoredFinding[];
}

/** Builds `criteria_by_asset`, the coverage-gap list, and every image-lane
 *  finding (per-asset low criteria, red flags, coverage gaps). Handles the
 *  zero-images path (F-029): a synthetic `_absent` pseudo-asset carries
 *  I1-I6 at 0/absent so the lane score and findings both degrade honestly
 *  without a real asset id to point at. */
function buildImageLane(
  scorableAssets: readonly Asset[],
  visualOutput: VisualDirectorOutput | null,
): ImageLaneResult {
  const criteriaByAsset: Record<string, Criterion[]> = {};
  const findings: ScoredFinding[] = [];

  if (scorableAssets.length === 0) {
    criteriaByAsset["_absent"] = IMAGE_CRITERIA.map((def) => makeAbsentCriterion(def.id, NO_IMAGES_EVIDENCE));
    for (const def of IMAGE_CRITERIA) {
      findings.push({
        finding: {
          id: `f-${def.id.toLowerCase()}-absent`,
          lane: "image",
          criterion: def.id,
          severity: "high",
          evidence_quote: NO_IMAGES_EVIDENCE,
          asset_ref: null,
        },
        impact: DEFAULT_IMPACT_BY_SEVERITY.high,
        effort: DEFAULT_EFFORT,
      });
    }
    // No images at all -> every coverage category is definitionally missing.
    return { criteriaByAsset, coverageGaps: [...ALL_COVERAGE_GAPS], findings };
  }

  const scoredByRef = new Map((visualOutput?.images ?? []).map((img) => [img.asset_ref, img.criteria]));
  for (const asset of scorableAssets) {
    const criteria =
      scoredByRef.get(asset.id) ??
      IMAGE_CRITERIA.map((def) =>
        makeAbsentCriterion(def.id, `No vision scoring available for asset ${asset.id}.`),
      );
    criteriaByAsset[asset.id] = criteria;
    for (const def of IMAGE_CRITERIA) {
      const criterion = criteria.find((c) => c.id === def.id);
      if (!criterion || criterion.score > 2) continue;
      const severity = severityFromScore(criterion.score);
      findings.push({
        finding: {
          id: `f-${def.id.toLowerCase()}-${asset.id}`,
          lane: "image",
          criterion: def.id,
          severity,
          evidence_quote: criterion.evidence || `${def.id} scored low with no evidence text.`,
          asset_ref: asset.id,
        },
        impact: DEFAULT_IMPACT_BY_SEVERITY[severity],
        effort: DEFAULT_EFFORT,
      });
    }
  }

  for (const flag of visualOutput?.red_flags ?? []) {
    findings.push({
      finding: {
        id: `f-redflag-${flag.asset_ref}`,
        lane: "image",
        criterion: "red_flag",
        severity: "high",
        evidence_quote: flag.reason,
        asset_ref: flag.asset_ref,
      },
      impact: DEFAULT_IMPACT_BY_SEVERITY.high,
      effort: DEFAULT_EFFORT,
    });
  }

  const coverageGaps = visualOutput?.coverage_gaps ?? [];
  return { criteriaByAsset, coverageGaps, findings };
}

function deriveCoverageFindings(coverageGaps: readonly string[]): ScoredFinding[] {
  return coverageGaps.map((gap) => ({
    finding: {
      id: `f-coverage-${gap.replace(/_/g, "-")}`,
      lane: "image",
      criterion: `coverage_${gap}`,
      severity: "medium",
      evidence_quote: `No ${gap.replace(/_/g, " ")} found in the harvested/uploaded image set.`,
      asset_ref: null,
    },
    impact: DEFAULT_IMPACT_BY_SEVERITY.medium,
    effort: COVERAGE_GAP_EFFORT,
  }));
}

// ---------------------------------------------------------------------------
// F-017 · Cross-platform NAP consistency (deterministic, no model)
// ---------------------------------------------------------------------------

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "49" + digits.slice(1);
  return digits;
}

export function normalizeAddress(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/straße/g, "strasse")
    .replace(/str\.(?=\s|\d|$)/g, "strasse")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBrandName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface NapSource {
  label: string;
  name: string | null;
  phone: string | null;
  address: string | null;
}

/** Best-effort structured extraction from `WebsiteEvidence`. The frozen
 *  schema carries no structured name/phone/address fields for the website
 *  (only `tel_links[]` and unstructured `visible_text`), so this is
 *  necessarily a light heuristic: brand name from h1/title, phone from the
 *  first `tel:` link, address via a German postal-code regex over the
 *  footer section. A miss just means fewer than 2 sources are available for
 *  that field, which resolves to "unknown" (see `computeNapConsistency`),
 *  never a false contradiction. */
function extractWebsiteNap(evidence: WebsiteEvidence): NapSource {
  const name = evidence.h1 ?? evidence.title ?? null;
  const telLink = evidence.tel_links[0];
  const phone = telLink ? telLink.replace(/^tel:/i, "") : null;
  const footerText = evidence.visible_text.find((s) => s.section === "footer")?.text ?? "";
  const addressMatch = footerText.match(
    /[\p{Lu}][\p{L}.\- ]+\s+\d+[a-z]?,?\s*\d{5}\s+[\p{Lu}][\p{L}\- ]+/u,
  );
  return { label: "website", name, phone, address: addressMatch?.[0] ?? null };
}

function portalToNapSource(portal: PortalEvidence): NapSource {
  return {
    label: `portal:${portal.platform}`,
    name: portal.brand_name ?? null,
    phone: portal.phone ?? null,
    address: portal.address ?? null,
  };
}

export interface NapConsistencyResult {
  nap_consistent: boolean | null;
  findings: ScoredFinding[];
}

/** GbpEvidence carries no name/phone/address in the frozen schema (only
 *  review_count/rating/has_photo_reviews/description), so it never
 *  participates in NAP comparison — only website + portals do. */
export function computeNapConsistency(
  websiteEvidence: WebsiteEvidence | null,
  portals: readonly PortalEvidence[],
): NapConsistencyResult {
  const sources: NapSource[] = [
    ...(websiteEvidence ? [extractWebsiteNap(websiteEvidence)] : []),
    ...portals.map(portalToNapSource),
  ];

  const fields: Array<{ key: "name" | "phone" | "address"; normalize: (v: string) => string }> = [
    { key: "name", normalize: normalizeBrandName },
    { key: "phone", normalize: normalizePhone },
    { key: "address", normalize: normalizeAddress },
  ];

  let anyComparable = false;
  let anyContradiction = false;
  const mismatchDetails: string[] = [];

  for (const field of fields) {
    const present = sources
      .map((s) => ({ label: s.label, raw: s[field.key] }))
      .filter((s): s is { label: string; raw: string } => s.raw !== null && s.raw.length > 0);
    if (present.length < 2) continue;
    anyComparable = true;
    const normalized = present.map((p) => ({ label: p.label, raw: p.raw, norm: field.normalize(p.raw) }));
    const first = normalized[0]!.norm;
    const consistent = normalized.every((n) => n.norm === first);
    if (!consistent) {
      anyContradiction = true;
      mismatchDetails.push(
        `${field.key}: ${normalized.map((n) => `${n.label}="${n.raw}"`).join(" vs ")}`,
      );
    }
  }

  if (!anyComparable) {
    return { nap_consistent: null, findings: [] };
  }
  if (!anyContradiction) {
    return { nap_consistent: true, findings: [] };
  }

  const evidence_quote =
    mismatchDetails.length > 0
      ? `Inconsistent business details across platforms — ${mismatchDetails.join("; ")}.`
      : "Inconsistent business name, phone, or address across platforms.";

  return {
    nap_consistent: false,
    findings: [
      {
        finding: {
          id: "f-nap",
          lane: "text",
          criterion: "nap_consistency",
          severity: "high",
          evidence_quote,
          asset_ref: null,
        },
        impact: DEFAULT_IMPACT_BY_SEVERITY.high,
        effort: DEFAULT_EFFORT,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// F-015/F-016 · Channel derivation, before_json, priority + pinning
// ---------------------------------------------------------------------------

function channelForFinding(finding: Finding): ChannelId | null {
  if (finding.lane === "text") {
    if (finding.criterion === "nap_consistency") return "platform_consistency";
    return TEXT_CRITERION_CHANNEL[finding.criterion] ?? null;
  }
  if (finding.criterion === "red_flag") return "image_fixes";
  if (finding.criterion.startsWith("coverage_")) {
    const gap = finding.criterion.slice("coverage_".length);
    return COVERAGE_GAP_CHANNEL[gap] ?? null;
  }
  return IMAGE_CRITERION_CHANNEL[finding.criterion] ?? null;
}

const SEVERITY_RANK: Record<Finding["severity"], number> = { high: 3, medium: 2, low: 1 };

function worstSeverity(severities: readonly Finding["severity"][]): Finding["severity"] {
  return severities.reduce((worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst), "low" as Finding["severity"]);
}

/** `before` payload per channel — original excerpts/asset refs the "Improve
 *  It" reveal diffs against (F-015: "before_json filled from original
 *  excerpts/asset refs"). */
function buildBeforeForChannel(
  channelId: ChannelId,
  findingsForChannel: readonly ScoredFinding[],
  textCriteria: readonly Criterion[],
): unknown {
  const catalog = CATALOG_BY_ID[channelId];
  if (catalog.lane === "text") {
    const criterionIds = findingsForChannel.map((f) => f.finding.criterion);
    const excerpts = criterionIds
      .map((id) => textCriteria.find((c) => c.id === id)?.evidence)
      .filter((e): e is string => Boolean(e));
    return { excerpts: [...new Set(excerpts)] };
  }
  const assetRefs = [...new Set(findingsForChannel.map((f) => f.finding.asset_ref).filter((r): r is string => r !== null))];
  return { asset_refs: assetRefs, notes: findingsForChannel.map((f) => f.finding.evidence_quote) };
}

function oneLinerForChannel(channelId: ChannelId, findingsForChannel: readonly ScoredFinding[]): string {
  if (findingsForChannel.length === 0) return CATALOG_BY_ID[channelId].improve_promise;
  const worst = findingsForChannel.reduce((a, b) =>
    b.impact ** 2 / b.effort > a.impact ** 2 / a.effort ? b : a,
  );
  return worst.finding.evidence_quote;
}

/** Groups every finding into the fixed catalog, computes `priority = max
 *  over its findings of impact²/effort` (F-016), fills `before`, and always
 *  includes the two pinned rows regardless of findings. */
function deriveChannels(allFindings: readonly ScoredFinding[], textCriteria: readonly Criterion[]): Channel[] {
  const buckets = new Map<ChannelId, ScoredFinding[]>();
  for (const sf of allFindings) {
    const channelId = channelForFinding(sf.finding);
    if (!channelId) continue; // defensive: unmapped criterion id, drop rather than crash
    const bucket = buckets.get(channelId) ?? [];
    bucket.push(sf);
    buckets.set(channelId, bucket);
  }

  const rows: Channel[] = [];
  for (const [channelId, bucket] of buckets) {
    const catalog = CATALOG_BY_ID[channelId];
    const findingIds = bucket.map((f) => f.finding.id).sort();
    const priority = Math.max(...bucket.map((f) => (f.impact ** 2) / f.effort));
    rows.push({
      id: channelId,
      lane: catalog.lane,
      title: catalog.title,
      one_liner: oneLinerForChannel(channelId, bucket),
      priority,
      severity: worstSeverity(bucket.map((f) => f.finding.severity)),
      status: "todo",
      finding_ids: findingIds,
      before: buildBeforeForChannel(channelId, bucket, textCriteria),
      after: null,
    });
  }

  // Pinned rows always appear (plan §2.5), independent of findings.
  if (!buckets.has("optimized_site")) {
    rows.push({
      id: "optimized_site",
      lane: "site",
      title: CATALOG_BY_ID.optimized_site.title,
      one_liner: "See your business the way it could look.",
      priority: 999,
      severity: "high",
      status: "todo",
      finding_ids: [],
      before: null,
      after: null,
    });
  }
  if (!buckets.has("promo_video")) {
    rows.push({
      id: "promo_video",
      lane: "video",
      title: CATALOG_BY_ID.promo_video.title,
      one_liner: "Coming soon.",
      priority: -1,
      severity: "low",
      status: "coming_soon",
      finding_ids: [],
      before: null,
      after: null,
    });
  }

  return orderChannels(rows);
}

/** `optimized_site` always first (full-width), `promo_video` always last
 *  (disabled); the remaining rows sort by priority desc with a deterministic
 *  alphabetical-id tie-break (F-016). Both pinned rows are excluded from
 *  that sort comparison entirely. */
export function orderChannels(rows: readonly Channel[]): Channel[] {
  const optimized = rows.find((r) => r.id === "optimized_site");
  const promo = rows.find((r) => r.id === "promo_video");
  const middle = rows
    .filter((r) => r.id !== "optimized_site" && r.id !== "promo_video")
    .slice()
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return [...(optimized ? [optimized] : []), ...middle, ...(promo ? [promo] : [])];
}

// ---------------------------------------------------------------------------
// F-012 · presence_coverage / reputation_chips
// ---------------------------------------------------------------------------

function derivePresenceCoverage(
  business: BusinessInput,
  napConsistent: boolean | null,
): Report["presence_coverage"] {
  return {
    website: Boolean(business.presence.website),
    maps: Boolean(business.presence.maps),
    yellow_pages: Boolean(business.presence.yellow_pages),
    other_count: business.presence.other?.length ?? 0,
    nap_consistent: napConsistent,
  };
}

function deriveReputationChips(
  gbp: GbpEvidence | null,
  business: BusinessInput,
): Report["reputation_chips"] {
  if (gbp) {
    return {
      review_count: gbp.review_count ?? null,
      rating: gbp.rating ?? null,
      has_photo_reviews: gbp.has_photo_reviews ?? null,
    };
  }
  const manual = business.gbp_manual;
  if (manual && (manual.review_count !== undefined || manual.rating !== undefined)) {
    return {
      review_count: manual.review_count ?? null,
      rating: manual.rating ?? null,
      has_photo_reviews: null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// buildReport — single entry point (F-010..F-017 composed)
// ---------------------------------------------------------------------------

export interface BuildReportInput {
  business: BusinessInput;
  websiteEvidence: WebsiteEvidence | null;
  portals: readonly PortalEvidence[];
  gbp: GbpEvidence | null;
  findability: TavilyFindability;
  copyOutput: CopyStrategistOutput | null;
  visualOutput: VisualDirectorOutput | null;
  /** Assets already harvested/uploaded for this audit. `generated_image`
   *  assets are excluded from lane scoring/coverage — at ANALYZE time (when
   *  buildReport runs) they cannot exist yet; the exclusion is defensive. */
  assets: readonly Asset[];
  executionMode: Report["execution_mode"];
  /** Optional passthrough so the orchestrator doesn't need a second call
   *  just to attach mode disclaimers (e.g. the REPLAY badge text). */
  disclaimers?: readonly string[];
  /** Unused by the current absence rules (see `resolveTextCriteria`) —
   *  `copyOutput === null` already fully determines the no-text-evidence
   *  path. Accepted for forward compatibility with the orchestrator's
   *  input assembly. */
  pastedTextProvided?: boolean;
}

/** Full `Report` shape minus the two Synthesizer-owned fields. The wave-2
 *  orchestrator calls this once, then spreads the result and adds
 *  `executive_summary` + `memory_note` from the Synthesizer call untouched. */
export type BuildReportResult = Omit<Report, "executive_summary" | "memory_note">;

export function buildReport(input: BuildReportInput): BuildReportResult {
  // --- text lane ---
  const textCriteria = resolveTextCriteria(input.copyOutput, input.websiteEvidence);
  const textFindings = deriveTextFindings(textCriteria, input.copyOutput?.findings ?? []);
  applyImpressumOverride(textFindings, input.websiteEvidence);
  applyWebsiteUnreachableOverride(textFindings, input.copyOutput, input.websiteEvidence);

  const nap = computeNapConsistency(input.websiteEvidence, input.portals);

  // --- image lane ---
  const scorableAssets = input.assets.filter((a) => a.kind !== "generated_image");
  const imageLane = buildImageLane(scorableAssets, input.visualOutput);
  const coverageFindings = deriveCoverageFindings(imageLane.coverageGaps);

  const allFindings: ScoredFinding[] = [
    ...textFindings,
    ...nap.findings,
    ...imageLane.findings,
    ...coverageFindings,
  ];

  const text_score = textLaneScore(textCriteria);
  const images_score = imageLaneScore(imageLane.criteriaByAsset);
  const { overall_score, band } = overallScore(text_score, images_score);

  const channels = deriveChannels(allFindings, textCriteria);

  return {
    overall_score,
    band,
    text: { score: text_score, criteria: textCriteria },
    images: {
      score: images_score,
      criteria_by_asset: imageLane.criteriaByAsset,
      coverage_gaps: imageLane.coverageGaps,
    },
    findability: input.findability,
    presence_coverage: derivePresenceCoverage(input.business, nap.nap_consistent),
    reputation_chips: deriveReputationChips(input.gbp, input.business),
    findings: allFindings.map((f) => f.finding),
    channels,
    execution_mode: input.executionMode,
    disclaimers: input.disclaimers ? [...input.disclaimers] : [],
  };
}
