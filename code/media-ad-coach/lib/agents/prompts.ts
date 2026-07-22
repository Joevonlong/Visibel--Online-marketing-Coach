/**
 * F-031 — Prompt library (plan Appendix B, feature-breakdown F-031).
 *
 * Appendix B drafts are used verbatim as the base for each system prompt,
 * extended with the T1-T8 / I1-I6 criterion anchor tables (plan §2.2/§2.3)
 * so scoring stays grounded in the frozen rubric, not the model's own
 * judgment of what "good" means. Image templates (§4.3) are per-trade,
 * per-shot-type presets for gpt-image-2, reviewed once at T2:30 per the
 * F-031 acceptance note.
 */
import type { Trade, TextChannelId } from "../schemas";

// ---------------------------------------------------------------------------
// Criterion anchor tables — embedded in the scoring prompts (plan §2.2/§2.3)
// ---------------------------------------------------------------------------

export const TEXT_CRITERIA_ANCHORS = `
T1 Value clarity / above-the-fold promise — weight 20%. 5/5: trade + area + specialty answered in the first visible sentence.
T2 CTA presence & specificity — weight 15%. 5/5: "Call now — we answer within 2 hours", not "learn more".
T3 Trust elements — weight 15%. 5/5: Meisterbetrieb / years in business / certifications / real guarantees.
T4 Local relevance — weight 15%. 5/5: city, region, radius, local landmarks named in the copy.
T5 Contact conversion path — weight 10%. 5/5: phone visible in header/footer text, hours listed, contact form has 5 fields or fewer.
T6 Readability — weight 10%. 5/5: short sentences, zero jargon, scannable structure.
T7 Correctness & compliance — weight 10%. 5/5: no spelling errors; red flags: "100% guaranteed", unverifiable superlatives; for doctor businesses additionally: health-claim caution (DE Heilmittelwerbegesetz sensitivity — an ASSUMPTION-level heuristic, flagged not lawyered).
T8 Legal hygiene — weight 5%. 5/5: Impressum + Datenschutz present (mandatory in Germany; missing is an instant "high" severity finding).
`.trim();

export const IMAGE_CRITERIA_ANCHORS = `
I1 Technical quality — weight 20%. 5/5: sharp, well-exposed, at least 1080px on the long edge. Typical failure: blurry night shot of a boiler.
I2 Subject & authenticity — weight 20%. 5/5: real team/real jobs, human faces, recognizably local. Typical failure: obvious stock photo, empty van.
I3 Job-proof value — weight 20%. 5/5: before/after pairs, process shots, finished work. Typical failure: only tool close-ups, no outcomes.
I4 Composition & framing — weight 15%. 5/5: clean background, deliberate framing, thumbnail-legible. Typical failure: cluttered garage, tilted horizon.
I5 Platform fit — weight 15%. 5/5: correct aspect ratio, text overlay under 20% of the frame area. Typical failure: flyer screenshot used as a photo.
I6 Branding & trust — weight 10%. 5/5: logo/uniform/vehicle branding, consistent across the set. Typical failure: no way to tell whose work it is.
`.trim();

export const DOCTOR_COMPLIANCE_INSTRUCTION =
  'Compliance for medical (doctor) businesses (DE Heilmittelwerbegesetz sensitivity — flagged not lawyered): never state or imply a healing promise or a guaranteed medical outcome, never use unverifiable superlatives ("best", "pain-free guaranteed", "100% safe"). Flag any such language you find, and never write any such language yourself.';

// ---------------------------------------------------------------------------
// Copy Strategist — T1-T8 (plan Appendix B, F-032)
// ---------------------------------------------------------------------------

export const COPY_STRATEGIST_SYSTEM = `You are a top local-marketing copy expert for small service businesses (trades, medical practices). Score criteria T1-T8 strictly against the anchors below. Use ONLY the extracted text evidence given in the user message — never invent content, and never rely on outside knowledge about the business. Every score of 2 or less needs a finding that quotes the EXACT sentence from the evidence (or names the exact absence, e.g. "no phone number appears anywhere in the provided text"). IMPORTANT: check the "site signals (machine-extracted)" evidence item before claiming an absence — when a phone number, email, Impressum, or Datenschutz WAS detected there but only on a subpage, describe it as "present but hard to find / not visible on the main page", NEVER as missing; only claim "missing/none" when the signals item also reports none. For medical (doctor) businesses, flag any healing promise or unverifiable superlative as a T7 red flag.

Criterion anchors (T1-T8):
${TEXT_CRITERIA_ANCHORS}

${DOCTOR_COMPLIANCE_INSTRUCTION}

For every criterion T1 through T8, output exactly one Criterion entry: {id, score 0-5, evidence (a quote or a named absence), source}. Set "source" to the tag of the evidence block you actually quoted (fetched/tavily/manual/screenshot); if no evidence block gave you a usable answer for that criterion, set score to 0 and source to "absent". For every finding, set impact (1-5) and effort (1-5) to estimate the priority of fixing it — do not compute a total, only these two sub-values. Output strictly follows the provided JSON schema. Never invent content.`;

// ---------------------------------------------------------------------------
// Visual Director — I1-I6 (plan Appendix B, F-033)
// ---------------------------------------------------------------------------

export const VISUAL_DIRECTOR_SYSTEM = `You are a performance-creative director who has reviewed 10,000 local-business photos. Score each image on I1-I6 from what you actually see; name failures concretely (e.g. "blurry boiler close-up, no human, no outcome") rather than generically. Then report coverage gaps: which of hero / team / work-proof / branding shots are missing from the whole set. Then report hard red flags (foreign watermark, stock-photo-as-own, privacy issue) with the asset_ref and a concrete reason.

Criterion anchors (I1-I6):
${IMAGE_CRITERIA_ANCHORS}

Each image in the user message is preceded by a text line giving its exact asset_ref — reference that exact asset_ref string in your output, never invent or renumber asset refs. Output strictly follows the provided JSON schema.`;

// ---------------------------------------------------------------------------
// Synthesizer — executive summary + channel one-liners (plan Appendix B, F-034)
// ---------------------------------------------------------------------------

export const SYNTHESIZER_SYSTEM = `Write the executive summary and one-line channel verdicts for a busy owner: plain words, no jargon, each verdict names the concrete problem. You may not alter any score or ranking — you are not given any numeric totals to change, only the channel list and findings for context. Stay strictly inside the findings' own facts: when a finding says contact or legal details exist but are buried or hard to find, say "hard to find", never "missing" or "none shown". Local-search findability describes whether the BUSINESS LISTING shows up in local search results — it says nothing about the website itself; when website evidence and website-derived findings exist, never call the website "missing" or "not found" (say "the business is hard to find in local search" instead). Always set memory_note to null in your output; the caller attaches any similar-audit comparison line separately, deterministically, from real memory data — do not write a memory or comparison sentence yourself anywhere in the executive summary or the channel one-liners.`;

// ---------------------------------------------------------------------------
// Rewriter — one call per text channel (plan Appendix B, F-050 consumer)
// ---------------------------------------------------------------------------

/** Per-channel, per-business system prompt for the text rewrite call. Built
 *  fresh per call (not a static constant) because it is parameterized by
 *  channel/trade/city — the wave-2 "Do It For You" engine passes the result
 *  straight into structuredCall's `system` option. */
export function REWRITER_SYSTEM(channel: TextChannelId, trade: Trade, city?: string | null): string {
  const cityPhrase = city ? ` in ${city}` : "";
  const complianceLine = trade === "doctor" ? `\n\n${DOCTOR_COMPLIANCE_INSTRUCTION}` : "";
  return `Rewrite ONLY this channel's content ("${channel}") for a ${trade}${cityPhrase}. Keep it honest: no invented certifications, no guarantees, no superlatives. Plain, local, trustworthy voice — write like a good craftsman talks. Return before_excerpt (a short excerpt of the original you are replacing, or "" if there was none) and the channel-specific after fields exactly matching the requested schema, plus a one-line rationale.

ISS-036 — write for a PAGE, not a document. Every card headline stays under 40 characters and every card body under 180 characters (about two short sentences). Lead with what the customer gets, cut throat-clearing and company history, never paste or paraphrase whole blocks of the original site, and never repeat internal labels such as "Business type:". Marketing-grade brevity beats completeness: what does not fit, does not matter.${complianceLine}`;
}

// ---------------------------------------------------------------------------
// GBP extraction — vision read of a Google Business Profile screenshot
// ---------------------------------------------------------------------------

/** FEA-114: image content classification. The taxonomy is intentionally loose
 *  — the model picks the closest bucket, and says `other` rather than forcing
 *  a fit. Categories mirror lib/images/taxonomy.ts / schemas.ts ImageCategory. */
export const IMAGE_CLASSIFIER_SYSTEM = `You are a marketing art director building the shot list for a local business's website. Work in two steps for every image.

STEP 1 — say what the MAIN SUBJECT of the frame is, in a few words, from what you can actually see ("three parked vans outside a building", "finished tiled bathroom", "close-up of a mixer tap"). Judge the subject that DOMINATES the frame, not a detail in the background.

STEP 2 — put that subject in exactly one category:
- "work_result": the finished outcome a customer pays for, shown as the subject — an installed bathroom, boiler, heating system, kitchen, repaired roof, renovated room, or a before/after of one. The frame is about the RESULT.
- "craft_detail": a close-up of skill or materials — fittings, valves, welds, joints, tiling, wiring, seams, textures, or a tool being used ON the work.
- "storefront": the business's premises as the subject — shopfront, entrance, signage on the building, reception, showroom, workshop interior.
- "team": people as the subject — owner, staff, crew, posed or working, recognisably the face of the business.
- "equipment": vehicles, machines, tools or gear as the subject rather than work being done — parked vans, a fleet, a machine on its own, a laid-out toolkit.
- "credentials": certificates, licences, awards, qualification seals, guild or chamber marks.
- "other": anything else — logos, wordmarks, stock or novelty imagery, price lists, menus, screenshots, maps, unclear or empty frames.

Rules that decide the hard cases:
- Parked vehicles or a van fleet are ALWAYS "equipment", even when company signage, a building, or a logo is visible behind them. A vehicle is not a finished job, and it is not a storefront.
- "work_result" requires the finished work itself to be the subject. A building exterior, a car park, a sign, or a person holding a tool is NOT a work_result.
- If the frame is mostly a person, it is "team", even if finished work is visible behind them.
- A screenshot of any website, map, or listing is "other", whatever it depicts.
- If two categories genuinely compete, choose the one describing the DOMINANT subject, and lower your confidence.
- Never force a fit. An image you cannot read confidently is "other" with a low confidence — that is a correct answer, not a failure.

Confidence is between 0 and 1 and must reflect real certainty: use below 0.5 whenever the subject is ambiguous, partially visible, or you are inferring rather than seeing. The rationale must name what you actually see in the frame, in one short concrete sentence. Output strictly follows the provided JSON schema, one entry per image, echoing the asset_ref you were given.`;

export const GBP_EXTRACTION_SYSTEM = `You extract structured data from a screenshot of a Google Business Profile (Google Maps listing). Read only what is visibly printed in the screenshot(s): review_count (the integer review count), rating (the average star rating, 0-5), has_photo_reviews (whether any review visibly includes a customer photo), and description (the business's own "About"/description text if visible). Set any field you cannot read with certainty to null — never guess, never estimate, never invent a plausible-looking number. Output strictly follows the provided JSON schema.`;

// ---------------------------------------------------------------------------
// Image generation — per-trade, per-shot-type prompt templates (plan §4.3)
// ---------------------------------------------------------------------------

// FEA-114: `storefront`, `craft_detail` and `equipment` exist so the generator
// can fill a MISSING shot-list category instead of producing another variant of
// a category the business already has covered.
export type ImageGenVariant = "hero" | "team" | "work_proof" | "storefront" | "craft_detail" | "equipment";

const IMAGE_GEN_STYLE_SUFFIX = "photorealistic, warm, natural light, honest working atmosphere, no text, no logos.";

/** Per-trade, per-shot-type prompt templates for gpt-image-2 (plan §4.3).
 *  The plumber/hero entry follows the plan's example prompt closely; the
 *  other trades and shot types are new but built to the same recipe: a
 *  concrete, honest subject description + the shared style suffix above so
 *  every template mentions "no text" and "no logos" (tests/agents.test.ts
 *  checks this). Doctor variants additionally carry the compliance
 *  instruction and stay strictly non-clinical (no procedures, no patients,
 *  no before/after medical imagery). */
/** F-096/ISS-008/ISS-016: real-business grounding passed through from
 *  `BusinessInput` + scraped website evidence (lib/improve/orchestrate.ts) down
 *  to the image prompt builders, so generated concepts are SERVICE-LEVEL and
 *  ad-grade — grounded in the business's actual named services, not generic
 *  per-trade art. `services` is the enumerated real offering (declared business
 *  types + background + scraped services/offerings content), pre-parsed by the
 *  orchestrator; when absent the builder derives it from `background`. */
export interface ImageGroundingContext {
  brand_name?: string | null;
  city?: string | null;
  background?: string | null;
  services?: string[] | null;
}

// Splits a free-text description or an offerings blob into candidate service
// phrases. Deterministic — the orchestrator and the tests derive services the
// same way (ISS-016).
const SERVICE_SPLIT = /[,;/\n·•]|\s\|\s|\s&\s|\band\b|\bund\b|\bsowie\b|\boder\b|\bor\b/i;
const SERVICE_LEADER = /^(wir bieten|unsere leistungen|leistungen|angebot|angebote|services|we offer|our services|offering|spezialisiert auf|speciali[sz]ing in)\s*:?\s*/i;

/** Parses concrete service phrases out of free text (background) or a scraped
 *  services/offerings blob. Trims list leaders and tenure clauses, drops noise,
 *  dedupes, caps at 6. Pure and exported so orchestrator + tests agree. */
export function parseServices(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(SERVICE_SPLIT)) {
    let s = raw.replace(SERVICE_LEADER, "");
    s = s.replace(/^[\s\-–—•·:.]+/, "").replace(/[\s\-–—.:]+$/, "").trim();
    // "... seit 1998" / "... since 1998" is tenure, not a service.
    s = s.replace(/\b(seit|since)\s+\d{4}.*$/i, "").trim();
    if (s.length < 3 || s.length > 70) continue;
    if (/^(www\.|https?:|tel:|\+?\d)/i.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

/** The business's real services: the pre-parsed `services` list when present
 *  (re-split defensively in case an entry is itself comma-joined), else parsed
 *  from `background`. */
function businessServices(business?: ImageGroundingContext): string[] {
  const source = business?.services && business.services.length > 0 ? business.services : [];
  if (source.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of source) {
      const parts = parseServices(entry);
      for (const p of parts.length > 0 ? parts : [entry.trim()]) {
        const key = p.toLowerCase();
        if (p.length >= 3 && !seen.has(key)) {
          seen.add(key);
          out.push(p);
        }
      }
    }
    if (out.length > 0) return out.slice(0, 6);
  }
  return parseServices(business?.background);
}

function tradeDescriptor(trade: Trade): string {
  return trade === "other" ? "local business" : `local ${trade}`;
}

/** ISS-041 — what makes a premises shot recognizably THIS trade's.
 *
 *  The defect: a plumber's `storefront` image came back as a photorealistic but
 *  anonymous residential front door — no van, no workshop, nothing of the
 *  trade. The prompt had asked for "the premises or branded vehicle … tidy,
 *  welcoming", which describes any building in Germany. Signage and logos are
 *  forbidden by the no-text rule (and would be invented branding anyway), so the
 *  ONLY honest way for a picture to say "plumber" is the trade's own visible
 *  objects. These are those objects, per trade. */
const STOREFRONT_TRADE_CUES: Record<Trade, string> = {
  plumber:
    "a work van with its side door open showing pipe lengths, fittings and tool cases, or an open workshop bay stacked with copper pipe, valves and a wheeled tool trolley",
  electrician:
    "a work van with its side door open showing cable drums, conduit and test gear, or an open workshop bay with cable reels, consumer units and a tool trolley",
  roofing:
    "a work vehicle loaded with roof tiles and ladders, or a yard with pallets of tiles, battens and safety harnesses staged ready for a job",
  handyman:
    "a work van with its side door open showing toolboxes, timber and a step ladder, or an open workshop bay with a workbench, power tools and materials",
  doctor:
    "a clean, modern practice entrance at street level — glass door, canopy or accessible ramp, and a glimpse of the bright reception inside (never a private house door, and no clinical procedures)",
  other:
    "the business's own working equipment, stock or work vehicle clearly visible, so the picture could only be this kind of business",
};

// Ad-grade commercial-photography direction per shot — concrete setting,
// composition, lighting, and mood (ISS-016 "精美"). Trade-NEUTRAL wording so a
// café/boutique never inherits another trade's imagery.
const VARIANT_DIRECTION: Record<ImageGenVariant, string> = {
  // ISS-039: "entrance, workshop or branded vehicle" read to the model as a
  // shopping list and came back as three panels in one frame. Pick ONE.
  // ISS-041: the direction must also say what the frame has to PROVE. Without
  // it the model produced an anonymous residential front door for a plumber —
  // technically a "premises shot", commercially worthless.
  storefront: "Premises shot: exactly one location — either the business's own working premises or its work vehicle, never both — photographed from a flattering three-quarter angle in soft daylight, tidy and busy with the trade's own equipment in frame: the shot that tells a local customer 'these people really do this work, and they look after their place.' Never an anonymous residential front door, apartment entrance, or generic office building with nothing of the trade visible.",
  craft_detail: "Craft close-up: a tight, beautifully lit macro of the workmanship itself — materials, fittings and finish — shallow depth of field, the kind of detail shot that proves skill without a word.",
  equipment: "Equipment shot: the professional tools and gear laid out or in use, clean and purposeful, shallow depth of field — quiet evidence that this business is properly equipped.",
  hero: "Hero advertising shot: fast prime lens, shallow depth of field, soft directional window light, a clean uncluttered composition and a confident, inviting mood — the single frame that makes a first-time customer trust and choose this business.",
  team: "Team/owner portrait: eye-level framing, genuine warm expressions, the real workspace softly in focus behind them, flattering natural light — the photo that makes a stranger comfortable enough to get in touch.",
  work_proof: "Portfolio 'after' shot of finished work: deliberate magazine-style framing, tidy and beautifully lit, showcasing the craftsmanship and finish of a completed job — aspirational but honest.",
};

const AD_GRADE_TAIL = "Professional commercial photography, photorealistic, sharp focus, natural light, no text, no logos.";
const NO_TEXT_INSTRUCTION = "Do not render any text, signage, or logos in the image.";

/** ISS-039 — the hard single-scene constraint. A real audit produced a
 *  "storefront" image that was a COLLAGE: two people with a van, a boiler room
 *  and a bathroom stitched into one frame. Every generation prompt ends with
 *  this rule, and it is deliberately exhaustive about the shapes a collage
 *  takes, because image models treat "grid", "split frame" and "before/after"
 *  as separate concepts. Exported so tests can assert every prompt carries it. */
export const SINGLE_SCENE_RULE =
  "ONE single photographic scene only — a single continuous frame taken by one photographer, from one camera position, at one moment in one place. Never a collage, grid, split-frame, multi-panel, diptych, triptych, montage, storyboard, side-by-side or before/after composition, and never smaller inset pictures, borders or dividing lines inside the frame.";

/** ISS-016 (service-level, ad-grade): composes ONE concept prompt like a
 *  commercial ad brief, anchored to a DISTINCT real service per shot so a
 *  multi-image set covers different aspects of the business rather than N
 *  variations of one generic scene. Hero foregrounds the business's headline
 *  service in progress, work_proof a beautifully finished result of a DIFFERENT
 *  service, team the people. Trade-neutral scaffolding + the business's own
 *  named services means zero cross-trade leakage; when no service/brand/
 *  background context exists at all it falls back to the neutral per-trade
 *  template. */
function composeServiceLevelPrompt(
  trade: Trade,
  variant: ImageGenVariant,
  business?: ImageGroundingContext,
  subject?: string | null,
): string {
  const hasContext = !!(business && (business.brand_name || business.background || (business.services && business.services.length > 0)));
  if (!hasContext) return templateFor(trade, variant);

  const services = businessServices(business);
  const descriptor = tradeDescriptor(trade);
  const brand = business?.brand_name?.trim() ? business.brand_name.trim() : `a ${descriptor}`;
  const cityPhrase = business?.city ? ` in ${business.city}` : "";
  const primary = services[0];
  const secondary = services.length > 1 ? services[1] : services[0];

  // ISS-041: a premises shot must be recognizable as THIS trade's premises, so
  // the trade's own visible equipment is named in the subject line itself —
  // both with and without a concrete filler subject.
  const storefrontCue = STOREFRONT_TRADE_CUES[trade];

  const focus = subject?.trim() || null;
  let subjectLine: string;
  if (focus) {
    subjectLine =
      variant === "craft_detail"
        ? `Show a close-up of the craftsmanship involved in "${focus}" — materials, fittings and finish at arm's length.`
        : variant === "equipment"
          ? `Show the professional equipment ${brand} uses for "${focus}", presented cleanly and purposefully.`
          : variant === "storefront"
            ? `Show "${focus}" as the subject of the frame, as the working base of ${brand} — with ${storefrontCue} clearly visible, so the picture could only belong to a ${descriptor}.`
            : `Show "${focus}" as the subject of the frame — a real, proud example of this exact service for ${brand}.`;
  } else if (variant === "storefront") {
    subjectLine = `Show where ${brand} actually works from — the working premises or work vehicle a local customer would arrive at — with ${storefrontCue} clearly visible, so the picture could only belong to a ${descriptor} and never to an anonymous house or office.`;
  } else if (variant === "craft_detail") {
    subjectLine = primary
      ? `Show a close-up of the craftsmanship involved in "${primary}" — materials, fittings and finish at arm's length.`
      : `Show a close-up of this business's craftsmanship — materials, fittings and finish at arm's length.`;
  } else if (variant === "equipment") {
    subjectLine = `Show the professional equipment ${brand} works with, presented cleanly and purposefully.`;
  } else if (variant === "team") {
    subjectLine = `Show the owner or small team of ${brand}, approachable and trustworthy, in their real working environment.`;
  } else if (variant === "hero") {
    subjectLine = primary
      ? `Show a real, in-progress moment of "${primary}" — the headline service that best sells this business — with a customer or the finished setting visible.`
      : `Show this business at its most appealing to its own customers, in its real setting.`;
  } else {
    subjectLine = secondary
      ? `Show a beautifully finished result of "${secondary}" — a proud, real example of completed work.`
      : `Show a proud, high-quality finished result of this business's own work.`;
  }

  const sentences: string[] = [
    `Commercial-grade advertising photograph for ${brand}, ${descriptor}${cityPhrase}.`,
    subjectLine,
    VARIANT_DIRECTION[variant],
  ];
  if (services.length > 0) {
    // ISS-039: a bare list of services invites the model to depict them all in
    // one frame. It is CONTEXT for getting one scene right, not a shot list.
    sentences.push(
      `Background context only, not things to depict together: this business offers ${services.join(", ")}. Use it so the single scene above is accurate to THIS business — never a generic ${descriptor} scene and never another trade's work — but photograph only that one scene; do not show several services in the same frame.`,
    );
  } else if (business?.background?.trim()) {
    sentences.push(
      `Background context only, not things to depict together: this business describes itself as "${business.background.trim()}". Ground the single scene above in that, never a generic or unrelated-trade scene.`,
    );
  }
  sentences.push(`${AD_GRADE_TAIL} ${NO_TEXT_INSTRUCTION}`);
  return sentences.join(" ");
}

/** Final concept-generation prompt (ISS-016): every trade is COMPOSED into a
 *  service-level, ad-grade brief from the real business context; only a
 *  context-free business falls back to the neutral per-trade template. */
export function buildImageGenPrompt(
  trade: Trade,
  variant: ImageGenVariant,
  business?: ImageGroundingContext,
  /** FEA-117: the concrete subject this shot must be OF ("Badsanierung", "gas
   *  boiler installation"), so several images of the same category are
   *  genuinely different pictures rather than one scene from three angles. */
  subject?: string | null,
): string {
  const base = composeServiceLevelPrompt(trade, variant, business, subject);
  // ISS-039: the old distinctness clause talked about "the other images in this
  // set", which is an invitation to render the set. Distinctness is enforced by
  // giving each shot its own subject/category (FEA-117/ISS-038); the prompt only
  // has to describe THIS one frame.
  const focus = subject?.trim()
    ? ` Build this single frame entirely around "${subject.trim()}": one room, one moment, one camera position, with its own distinctive angle, lighting and composition.`
    : "";
  return `${base}${focus} ${SINGLE_SCENE_RULE}`;
}

/** F-096/ISS-008: edit instruction for upgrading the business's own
 *  best real photo (via `images.edit`) into a professional hero shot instead
 *  of generating a brand-new concept. Deliberately conservative — every verb
 *  is a presentation fix (lighting/clarity/crop), never a content change. */
export function buildHeroEditPrompt(trade: Trade, business?: ImageGroundingContext): string {
  const tradeLabel = trade === "other" ? "local service business" : trade;
  const businessPhrase = business?.brand_name
    ? ` for ${business.brand_name}${business.city ? ` in ${business.city}` : ""}`
    : "";
  return `Upgrade this real ${tradeLabel} photo${businessPhrase} into a professional hero shot for a business website. Preserve the real people, place, work, and branding exactly as shown in the photo — correct only lighting, clarity, and crop. Do not invent work, people, credentials, or outcomes, and do not add any new text, signage, or logos that are not already in the original photo. Return the same single photograph, improved: ${SINGLE_SCENE_RULE}`;
}

/** FEA-114: the hand-written per-trade fallbacks cover the three ORIGINAL shot
 *  types. The gap-filling variants (storefront / craft_detail / equipment) are
 *  only ever chosen when real business context exists — a business with no
 *  context has no missing-category analysis to act on — so they are composed,
 *  never templated. `templateFor` keeps that explicit instead of forcing six
 *  more hand-written strings per trade. */
export type BaseImageGenVariant = "hero" | "team" | "work_proof";

const BASE_VARIANT_FALLBACK: Record<Exclude<ImageGenVariant, BaseImageGenVariant>, BaseImageGenVariant> = {
  storefront: "hero",
  craft_detail: "work_proof",
  equipment: "work_proof",
};

export function templateFor(trade: Trade, variant: ImageGenVariant): string {
  const base: BaseImageGenVariant =
    variant === "hero" || variant === "team" || variant === "work_proof" ? variant : BASE_VARIANT_FALLBACK[variant];
  return IMAGE_GEN_TEMPLATES[trade][base];
}

export const IMAGE_GEN_TEMPLATES: Record<Trade, Record<BaseImageGenVariant, string>> = {
  plumber: {
    hero: `Photorealistic, warm, natural-light photo of a friendly professional plumber in branded workwear installing a modern bathroom fixture in a German home, honest working atmosphere, no text, no logos.`,
    team: `Photorealistic, warm, natural-light photo of a small plumbing team of 2-3 people in matching branded workwear standing together in front of their service van, confident and approachable, ${IMAGE_GEN_STYLE_SUFFIX}`,
    work_proof: `Photorealistic, warm, natural-light photo of a freshly completed plumbing repair — clean new pipework and fixtures, tools neatly organized nearby, clearly finished professional work, ${IMAGE_GEN_STYLE_SUFFIX}`,
  },
  electrician: {
    hero: `Photorealistic, warm, natural-light photo of a friendly professional electrician in branded workwear installing a modern fuse box or light fixture in a German home, ${IMAGE_GEN_STYLE_SUFFIX}`,
    team: `Photorealistic, warm, natural-light photo of a small electrician team of 2-3 people in matching branded workwear standing together in front of their service van, confident and approachable, ${IMAGE_GEN_STYLE_SUFFIX}`,
    work_proof: `Photorealistic, warm, natural-light photo of a freshly completed electrical installation — neatly routed cabling and a tidy switchboard, clearly finished professional work, ${IMAGE_GEN_STYLE_SUFFIX}`,
  },
  roofing: {
    hero: `Photorealistic, warm, natural-light photo of a friendly professional roofer in branded workwear and safety harness working on a residential rooftop in Germany, ${IMAGE_GEN_STYLE_SUFFIX}`,
    team: `Photorealistic, warm, natural-light photo of a small roofing team of 2-3 people in matching branded workwear standing together in front of their service van, confident and approachable, ${IMAGE_GEN_STYLE_SUFFIX}`,
    work_proof: `Photorealistic, warm, natural-light photo of a freshly completed roof repair — clean new tiles or shingles laid in neat rows, clearly finished professional work, ${IMAGE_GEN_STYLE_SUFFIX}`,
  },
  handyman: {
    hero: `Photorealistic, warm, natural-light photo of a friendly professional handyman in branded workwear repairing a door or cabinet in a German home, ${IMAGE_GEN_STYLE_SUFFIX}`,
    team: `Photorealistic, warm, natural-light photo of a small handyman team of 2-3 people in matching branded workwear standing together in front of their service van, confident and approachable, ${IMAGE_GEN_STYLE_SUFFIX}`,
    work_proof: `Photorealistic, warm, natural-light photo of a freshly completed home repair — a neatly reassembled fixture or freshly painted wall, clearly finished professional work, ${IMAGE_GEN_STYLE_SUFFIX}`,
  },
  doctor: {
    hero: `Photorealistic, warm, natural-light photo of a friendly, approachable doctor in a clean modern practice reception area in Germany, professional practice setting, no medical claims imagery, ${IMAGE_GEN_STYLE_SUFFIX}`,
    team: `Photorealistic, warm, natural-light photo of a small medical practice team of 2-3 people in clean professional attire standing together in a bright modern reception area, approachable and trustworthy, professional practice setting, no medical claims imagery, ${IMAGE_GEN_STYLE_SUFFIX}`,
    work_proof: `Photorealistic, warm, natural-light photo of a clean, modern, well-organized examination or consultation room, no patients, no procedures, no before/after imagery, professional practice setting, no medical claims imagery, ${IMAGE_GEN_STYLE_SUFFIX}`,
  },
  // ISS-016: kept trade-NEUTRAL. This is only the zero-context fallback for an
  // "other"/custom business — the primary path composes from the real business
  // context (buildOtherContextPrompt). No tradesperson/workwear/service-van
  // vocabulary, so a café or boutique never inherits plumber-style imagery.
  other: {
    hero: `Photorealistic, warm, natural-light photo of a friendly local independent business owner welcoming a customer in their own workspace or storefront, honest everyday atmosphere, ${IMAGE_GEN_STYLE_SUFFIX}`,
    team: `Photorealistic, warm, natural-light photo of a small local-business team of 2-3 people standing together in their own workspace, confident and approachable, ${IMAGE_GEN_STYLE_SUFFIX}`,
    work_proof: `Photorealistic, warm, natural-light photo of a proud, high-quality example of a local business's own work, product, or space, clearly well cared for, ${IMAGE_GEN_STYLE_SUFFIX}`,
  },
};
