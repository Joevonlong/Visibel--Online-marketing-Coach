/**
 * F-051/F-052/F-053 — Image generation, truth labeling, and the failure
 * ladder for the "Do It For You" engine (plan §4.3).
 *
 * Concept generation remains capped at 3 per audit (hero + 2). F-096 adds
 * edits of real source photos while raising the combined generated/edited
 * output cap to 5. Concept images are always stored with `label:
 * "ai_concept"` (F-052's non-negotiable truth
 * rule), and generation is never allowed to throw the run over — a failure
 * or a cap-hit still produces a usable channel result (shot brief +
 * best-existing-photo fallback), never a fake image (F-053).
 *
 * ISS-007/ISS-008: every OpenAI image call goes through a hard per-call
 * timeout (never hangs the "generating_images" stage), and `hero_image`
 * prefers editing the business's own best real photo over generating a
 * generic concept, grounded in the real brand/city/service context when one
 * exists.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import OpenAI, { toFile } from "openai";
import { getModels, getOpenAIClient } from "../agents/openai";
import {
  buildHeroEditPrompt,
  buildImageGenPrompt,
  SINGLE_SCENE_RULE,
  type ImageGenVariant,
  type ImageGroundingContext,
} from "../agents/prompts";
import { insertAsset, listAssets, updateAsset, type AssetRecord } from "../db";
import { COLLAGE_CORRECTION, detectCollage } from "../images/collage";
import { computeFingerprint } from "../images/fingerprint";
import { pickFillerSubjects } from "../images/subjects";
import {
  buildCandidates,
  categoryOf,
  collapseLineages,
  compositionPolicyFor,
  coveredCategories,
  subjectOf,
  isHeroEditableCategory,
  isKnownUnusableContent,
  rankRealPhotosForSlot,
} from "../images/taxonomy";
import type { ImageCategory, Trade } from "../schemas";
import { curateAfterOriginal, isTextHeavySource } from "./curate";

// ---------------------------------------------------------------------------
// ISS-007 · Hard per-call timeout + ISS-006 · quality speed knob
// ---------------------------------------------------------------------------

/** FEA-112: the total per-call budget is now generous (15 min) because image
 *  generation no longer blocks anything a judge is waiting on — the report and
 *  the text preview complete first and images land into a live page afterwards.
 *  A tight total cap was only ever a proxy for "is this call dead?", and it
 *  answered that question wrongly: measured on this account, the SAME
 *  gpt-image-2 hero call took 38.5s once and >500s another time. `STALL` is the
 *  honest liveness test — with streaming we see a partial image within ~13s, so
 *  silence for two minutes means dead, whatever the total elapsed time. */
const DEFAULT_IMAGE_TIMEOUT_MS = 900_000;
const DEFAULT_IMAGE_STALL_MS = 120_000;

/** Reads the per-call image timeout from env on every call (not cached) so
 *  tests can flip it between cases. Falls back to the default on a
 *  missing/invalid value rather than disabling the timeout. */
function getImageTimeoutMs(): number {
  const raw = process.env.OPENAI_IMAGE_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IMAGE_TIMEOUT_MS;
}

/** FEA-112: maximum silence BETWEEN streaming events before a call counts as
 *  dead. Only meaningful on the streaming path; the non-streaming path has no
 *  events to time and relies on the total budget alone. */
function getImageStallMs(): number {
  const raw = process.env.OPENAI_IMAGE_STALL_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IMAGE_STALL_MS;
}

/** FEA-112: streaming is the officially documented fast path for gpt-image-2
 *  (`stream: true` + `partial_images`, developers.openai.com image-generation
 *  guide) and the only way to observe progress mid-call. Opt out with
 *  `OPENAI_IMAGE_STREAM=0` if a provider/model ever rejects it. */
function isImageStreamingEnabled(): boolean {
  return process.env.OPENAI_IMAGE_STREAM !== "0";
}

/** One partial is enough: it is what makes an image visible to the visitor in
 *  ~13s instead of ~44s, and every extra partial is another full-size payload
 *  over the wire. */
const PARTIAL_IMAGES = 1;

const IMAGE_QUALITIES = new Set(["low", "medium", "high"]);
type ImageQuality = "low" | "medium" | "high";

/** ISS-006 speed knob: default stays "medium" (unchanged behavior) unless
 *  overridden with an allowed value. */
function getImageQuality(): ImageQuality {
  const raw = process.env.OPENAI_IMAGE_QUALITY;
  return raw && IMAGE_QUALITIES.has(raw) ? (raw as ImageQuality) : "medium";
}

// ---------------------------------------------------------------------------
// ISS-027 · Downgrade retry + timing telemetry
// ---------------------------------------------------------------------------

/** ISS-027: what one channel's image work actually cost, recorded whether it
 *  succeeded or failed. Surfaced on the result (→ progress_events detail) and
 *  on a successful asset's `meta_json`, so "all three images timed out at
 *  exactly 120s" is visible in the run's own evidence instead of needing a
 *  side-channel measurement. */
export interface ImageCallTiming {
  /** Total wall clock across every provider call made for this channel. */
  duration_ms: number;
  /** Number of provider calls made (2 when a downgrade retry ran). */
  attempts: number;
  /** Model/quality of the LAST attempt — i.e. what actually produced the
   *  result (or what failed last). */
  model: string;
  quality: ImageQuality;
  /** True when the primary attempt failed and the downgrade retry ran. */
  downgraded: boolean;
  /** FEA-112: ms until the first streamed partial image of the winning
   *  attempt — i.e. when the visitor could first SEE something. `null` when the
   *  call did not stream (or produced no partial). */
  partial_ms: number | null;
}

const EMPTY_TIMING: ImageCallTiming = { duration_ms: 0, attempts: 0, model: "", quality: "medium", downgraded: false, partial_ms: null };

function addTiming(a: ImageCallTiming, b: ImageCallTiming): ImageCallTiming {
  if (b.attempts === 0) return a;
  if (a.attempts === 0) return b;
  return {
    duration_ms: a.duration_ms + b.duration_ms,
    attempts: a.attempts + b.attempts,
    model: b.model,
    quality: b.quality,
    downgraded: a.downgraded || b.downgraded,
    partial_ms: b.partial_ms ?? a.partial_ms,
  };
}

/** Human-readable one-liner for progress-event details / logs. */
export function describeImageTiming(timing: ImageCallTiming): string {
  const seconds = (timing.duration_ms / 1000).toFixed(1);
  const retry = timing.downgraded ? `, ${timing.attempts} attempts incl. low-quality retry` : "";
  const firstLook = timing.partial_ms !== null ? `, first partial at ${(timing.partial_ms / 1000).toFixed(1)}s` : "";
  return `${seconds}s (${timing.model}/${timing.quality}${firstLook}${retry})`;
}

interface ImageCallOutcome {
  b64: string | null;
  error: string | null;
  timing: ImageCallTiming;
}

type ImageResponseLike = { data?: Array<{ b64_json?: string | null } | null> | null };

/** One streamed image event (`image_generation.partial_image` /
 *  `image_generation.completed`, and the `image_edit.*` equivalents). Typed
 *  structurally rather than imported so a fake client in tests can emit the
 *  same shape without pulling the SDK's event unions in. */
interface ImageStreamEvent {
  type?: string;
  b64_json?: string | null;
  partial_image_index?: number | null;
}

type ImageInvokeResult = ImageResponseLike | AsyncIterable<ImageStreamEvent>;

function isAsyncIterable(value: unknown): value is AsyncIterable<ImageStreamEvent> {
  return typeof (value as AsyncIterable<ImageStreamEvent> | null)?.[Symbol.asyncIterator] === "function";
}

export interface ImageInvokeParams {
  model: string;
  quality: ImageQuality;
  timeoutMs: number;
  /** FEA-112: callers pass these straight to the provider; a fake client in
   *  tests can ignore them and return a plain response object. */
  stream: boolean;
  partialImages: number;
}

/** FEA-112: called the moment a partial image arrives, so a caller can put a
 *  real (if soft) image in front of the visitor at ~13s instead of ~44s. */
export type OnPartialImage = (b64: string, elapsedMs: number) => void;

interface ImageCallOptions {
  onPartial?: OnPartialImage;
}

/** ISS-027/FEA-112: one provider image call, timed, with exactly ONE retry on
 *  failure (timeout, stall, API error, or an empty response). The retry stays
 *  on the SAME model at `quality: "low"` — switching models is forbidden by
 *  human decision (2026-07-21: gpt-image-2 is chosen for quality) — and gets
 *  half the remaining budget. Never throws: the caller gets `{b64: null,
 *  error}` and decides how to fall back (F-053). The reported error is the
 *  PRIMARY failure — that is the root cause — with the retry's own failure
 *  appended so neither is hidden.
 *
 *  On the streaming path the loop is guarded per EVENT (`getImageStallMs`) in
 *  addition to the total budget, which is what actually distinguishes "slow"
 *  from "dead": a healthy gpt-image-2 call emits its first partial in ~13s. */
async function callImageWithDowngrade(
  label: "Image generation" | "Image edit",
  invoke: (params: ImageInvokeParams) => Promise<ImageInvokeResult>,
  options: ImageCallOptions = {},
): Promise<ImageCallOutcome> {
  const primaryModel = getModels().image;
  const primaryQuality = getImageQuality();
  const primaryTimeout = getImageTimeoutMs();
  const streaming = isImageStreamingEnabled();

  const attempt = async (
    quality: ImageQuality,
    timeoutMs: number,
  ): Promise<{ b64: string | null; error: string | null; duration_ms: number; partial_ms: number | null }> => {
    const startedAt = Date.now();
    let partialMs: number | null = null;
    try {
      const b64 = await withImageTimeout(
        (async (): Promise<string | null> => {
          const result = await invoke({
            model: primaryModel,
            quality,
            timeoutMs,
            stream: streaming,
            partialImages: PARTIAL_IMAGES,
          });
          if (!isAsyncIterable(result)) {
            return result.data?.[0]?.b64_json ?? null;
          }

          // Streamed: every event resets the stall guard, and the last image
          // payload seen wins (`completed` normally, but a stream that ends
          // after only partials still yields a real, if softer, image rather
          // than nothing).
          const iterator = result[Symbol.asyncIterator]();
          const stallMs = Math.min(getImageStallMs(), timeoutMs);
          let latest: string | null = null;
          for (;;) {
            const next = await withImageTimeout(iterator.next(), stallMs, `${label} stalled`);
            if (next.done) break;
            const event = next.value;
            if (typeof event?.b64_json !== "string" || event.b64_json.length === 0) continue;
            latest = event.b64_json;
            if (event.type?.endsWith("partial_image")) {
              if (partialMs === null) partialMs = Date.now() - startedAt;
              options.onPartial?.(event.b64_json, Date.now() - startedAt);
            }
          }
          return latest;
        })(),
        timeoutMs,
        label,
      );
      if (!b64) throw new Error(`OpenAI ${label.toLowerCase()} returned no image data.`);
      return { b64, error: null, duration_ms: Date.now() - startedAt, partial_ms: partialMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { b64: null, error: message, duration_ms: Date.now() - startedAt, partial_ms: partialMs };
    }
  };

  const primary = await attempt(primaryQuality, primaryTimeout);
  if (primary.b64) {
    return {
      b64: primary.b64,
      error: null,
      timing: {
        duration_ms: primary.duration_ms,
        attempts: 1,
        model: primaryModel,
        quality: primaryQuality,
        downgraded: false,
        partial_ms: primary.partial_ms,
      },
    };
  }

  const retryQuality: ImageQuality = "low";
  const retryTimeout = Math.max(1, Math.floor(primaryTimeout / 2));
  const retry = await attempt(retryQuality, retryTimeout);
  const timing: ImageCallTiming = {
    duration_ms: primary.duration_ms + retry.duration_ms,
    attempts: 2,
    model: primaryModel,
    quality: retryQuality,
    downgraded: true,
    partial_ms: retry.partial_ms ?? primary.partial_ms,
  };
  if (retry.b64) return { b64: retry.b64, error: null, timing };
  return { b64: null, error: `${primary.error} (low-quality retry on ${primaryModel} also failed: ${retry.error})`, timing };
}

/** Races an OpenAI image call against a timer so a stuck HTTP call can never
 *  hang the run — this is on top of (not instead of) the OpenAI SDK's own
 *  per-request `{ timeout }` option passed at each call site, which is what
 *  actually aborts the real HTTP request; this race is what makes the
 *  timeout observable in tests that inject a fake client with no real
 *  transport to abort. The timer is always cleared, whichever side wins, so
 *  a fast call never leaves a dangling handle. */
function withImageTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Storage (same APP_STORAGE_DIR convention as lib/pipeline/images.ts)
// ---------------------------------------------------------------------------

function resolveStorageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return join(process.cwd(), "storage");
}

function ensureGeneratedDir(auditId: string): string {
  const dir = join(resolveStorageRoot(), "generated", auditId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveAssetFilePath(storagePath: string): string {
  return isAbsolute(storagePath) ? storagePath : join(resolveStorageRoot(), storagePath);
}

// ---------------------------------------------------------------------------
// F-051 · Generation cap + best-existing-photo fallback
// ---------------------------------------------------------------------------

/** Plan §4.3/F-096: at most 3 AI concepts (hero + 2), and at most 5 image
 * outputs once enhanced real-photo edits are included. Both are checked
 * against persisted assets so re-improves still respect the budget. */
/** FEA-117 raised these: the After gallery must hold at least
 *  `policy.gallery_min` (4) images, and the hero and about slots consume their
 *  own generated images without contributing a gallery tile (ISS-035 shows one
 *  picture once). The caps stay hard limits on cost — they are budgets, not
 *  targets, and a run only generates what the gap analysis actually asks for. */
export const CONCEPT_IMAGE_CAP = 8;
export const GENERATED_IMAGE_CAP = 10;

export type GeneratedImageChannelId = "hero_image" | "team_image" | "work_proof_images";

export function countGeneratedImages(auditId: string): number {
  return listAssets(auditId).filter((a) => a.kind === "generated_image").length;
}

function countConceptImages(auditId: string): number {
  return listAssets(auditId).filter((asset) => asset.kind === "generated_image" && asset.label === "ai_concept").length;
}

/** Ranks real (harvested/uploaded) photos by summed I1-I6 sub-scores
 *  (`score_json`) and returns the best one — the F-053 fallback used both on
 *  a generation failure/cap-skip and by preview assembly. gbp_screenshot and
 *  generated_image assets are excluded: a screenshot isn't a usable
 *  marketing photo, and a generated image isn't "existing" evidence of the
 *  real business. An unscored real photo (score_json null/empty, e.g. a
 *  fresh upload the Visual Director hasn't seen) ranks below any scored
 *  photo but is still preferred over no photo at all. */
export function pickBestExistingAsset(auditId: string): AssetRecord | null {
  const candidates = listAssets(auditId).filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image");
  if (candidates.length === 0) return null;

  const scoreOf = (asset: AssetRecord): number => {
    const criteria = asset.score_json;
    if (!Array.isArray(criteria)) return -1;
    return criteria.reduce((sum: number, entry) => {
      const score = (entry as { score?: unknown } | null)?.score;
      return sum + (typeof score === "number" ? score : 0);
    }, 0);
  };

  return candidates.reduce((best, current) => (scoreOf(current) > scoreOf(best) ? current : best));
}

// ---------------------------------------------------------------------------
// F-052 · Shot briefs — every image channel gets one, generation or not
// ---------------------------------------------------------------------------

const HERO_SHOT_BRIEFS: Record<Trade, string> = {
  plumber:
    "One confident hero shot: a friendly plumber in branded workwear mid-task on a real job, natural light, honest working atmosphere — the single photo that tells a visiting customer 'this is a real, professional local plumber, ready to help today.'",
  electrician:
    "One confident hero shot: a friendly electrician in branded workwear mid-task at a fuse box or fixture, natural light, honest working atmosphere — the single photo that tells a visiting customer 'this is a real, professional local electrician, ready to help today.'",
  roofing:
    "One confident hero shot: a friendly roofer in branded workwear and safety harness working on a residential roof, natural light, honest working atmosphere — the single photo that tells a visiting customer 'this is a real, professional local roofer, ready to help today.'",
  handyman:
    "One confident hero shot: a friendly handyman in branded workwear mid-repair in a home, natural light, honest working atmosphere — the single photo that tells a visiting customer 'this is a real, professional local handyman, ready to help today.'",
  doctor:
    "One confident hero shot: a friendly, approachable doctor in a clean modern practice reception area, professional and warm, no clinical procedures visible — the single photo that tells a visiting patient 'this is a real, welcoming local practice.'",
  other:
    "One confident hero shot: a friendly professional at work in a German home or storefront, natural light, honest working atmosphere — the single photo that tells a visiting customer 'this is a real, professional local business, ready to help today.'",
};

const TEAM_SHOT_BRIEFS: Record<Trade, string> = {
  plumber:
    "One team/owner portrait: 2-3 people (or the solo owner) in matching branded workwear standing together, approachable, ideally in front of the service van — the photo that makes a stranger trust you enough to call.",
  electrician:
    "One team/owner portrait: 2-3 people (or the solo owner) in matching branded workwear standing together, approachable, ideally in front of the service van — the photo that makes a stranger trust you enough to call.",
  roofing:
    "One team/owner portrait: 2-3 people (or the solo owner) in matching branded workwear standing together, approachable, ideally in front of the service van — the photo that makes a stranger trust you enough to call.",
  handyman:
    "One team/owner portrait: 2-3 people (or the solo owner) in matching branded workwear standing together, approachable, ideally in front of the service van — the photo that makes a stranger trust you enough to call.",
  doctor:
    "One team portrait: 2-3 practice staff in clean professional attire standing together in a bright reception area, approachable and trustworthy, no patients in frame — the photo that makes a stranger trust the practice enough to book.",
  other:
    "One team/owner portrait: 2-3 people (or the solo owner) in matching branded attire standing together, approachable — the photo that makes a stranger trust you enough to call.",
};

const WORK_PROOF_SHOT_LISTS: Record<Trade, readonly string[]> = {
  plumber: [
    "Before: the exact leak/fault as first found",
    "After: the same angle, completed repair",
    "Close-up of new fittings/pipework installed",
    "Wide shot of the finished bathroom/kitchen/utility area",
    "Tools and materials laid out neatly, van branding visible",
    "Technician mid-task, PPE and branded workwear visible",
    "Boiler/fixture nameplate or install detail for authenticity",
    "Customer's space left tidy and protected (drop cloths, floor protection)",
    "Service van parked outside the job site",
    "A finished-job handshake or sign-off moment (only with customer permission)",
  ],
  electrician: [
    "Before: the exact fault (old fuse box, exposed wiring) as first found",
    "After: the same angle, completed installation",
    "Close-up of the new switchboard or fixture wiring, neatly routed",
    "Wide shot of the finished room with the new installation in context",
    "Tools and testing equipment laid out neatly, van branding visible",
    "Technician mid-task, PPE and branded workwear visible",
    "Certification label or test sticker on the finished panel",
    "Customer's space left tidy and protected",
    "Service van parked outside the job site",
    "A finished-job handshake or sign-off moment (only with customer permission)",
  ],
  roofing: [
    "Before: the exact damage (missing tiles, leak point) as first found",
    "After: the same angle, completed repair",
    "Close-up of new tiles/shingles laid in neat rows",
    "Wide shot of the finished roof from ground level",
    "Tools and materials staged neatly on site, van branding visible",
    "Roofer mid-task, harness and branded workwear visible",
    "Flashing/guttering detail shot for craftsmanship",
    "Property and garden left tidy after the job",
    "Service van/scaffold parked outside the job site",
    "A finished-job handshake or sign-off moment (only with customer permission)",
  ],
  handyman: [
    "Before: the exact issue (broken door, damaged wall) as first found",
    "After: the same angle, completed repair",
    "Close-up of the finished joinery/paintwork/fixture detail",
    "Wide shot of the finished room in context",
    "Tools laid out neatly, van/kit branding visible",
    "Handyman mid-task, branded workwear visible",
    "A small multi-job montage (door + shelf + paint) if available",
    "Customer's space left tidy after the job",
    "Service van parked outside the job site",
    "A finished-job handshake or sign-off moment (only with customer permission)",
  ],
  doctor: [
    "Reception area, welcoming and clean, no patients in frame",
    "Waiting room, comfortable and tidy",
    "Consultation room, organized and modern, no patients or procedures",
    "Exterior/entrance signage of the practice",
    "Equipment or workstation, tidy and professional, no patient data visible",
    "Staff at the reception desk (with consent), approachable",
    "Certificates/qualifications displayed on the wall",
    "A clean hallway or corridor shot for scale/professionalism",
    "Parking or accessibility features near the entrance",
    "A close-up of a tidy, organized supply/instrument tray (no identifiable patient info)",
  ],
  other: [
    "Before: the issue as first found",
    "After: the same angle, completed work",
    "Close-up detail of the finished work",
    "Wide shot of the finished result in context",
    "Tools/materials laid out neatly, branding visible",
    "Staff mid-task, branded attire visible",
    "A second completed job for variety",
    "Workspace left tidy after the job",
    "Vehicle or storefront with visible branding",
    "A finished-job handshake or sign-off moment (only with customer permission)",
  ],
};

const IMAGE_FIXES_SHOT_BRIEF =
  "Photo triage brief: relight or retake anything dim/blurry, crop out cluttered backgrounds, replace anything that reads as stock or generic with a real job photo, and make sure branding (logo, van, uniform) is visible in at least one shot.";

/** Every image channel gets a concrete shot brief regardless of generation
 *  success (F-052) — this is the only place brief text is produced, so
 *  generation success/failure/cap-skip all read from the same source. */
export function buildShotBrief(channelId: GeneratedImageChannelId | "image_fixes", trade: Trade): string {
  if (channelId === "hero_image") return HERO_SHOT_BRIEFS[trade];
  if (channelId === "team_image") return TEAM_SHOT_BRIEFS[trade];
  if (channelId === "work_proof_images") {
    return `10-shot list tailored to a ${trade === "other" ? "local service business" : trade}:\n${WORK_PROOF_SHOT_LISTS[trade].map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  }
  return IMAGE_FIXES_SHOT_BRIEF;
}

// ---------------------------------------------------------------------------
// F-051 · Generation
// ---------------------------------------------------------------------------

const VARIANT_BY_CHANNEL: Record<GeneratedImageChannelId, ImageGenVariant> = {
  hero_image: "hero",
  team_image: "team",
  work_proof_images: "work_proof",
};

/** FEA-114: what each image channel is FOR, in shot-list terms. The channel
 *  ids are frozen product surface; the category is what the generator actually
 *  reasons about. */
const CATEGORY_BY_CHANNEL: Record<GeneratedImageChannelId, ImageCategory> = {
  hero_image: "work_result",
  team_image: "team",
  work_proof_images: "work_result",
};

const VARIANT_BY_CATEGORY: Record<ImageCategory, ImageGenVariant> = {
  storefront: "storefront",
  team: "team",
  work_result: "work_proof",
  craft_detail: "craft_detail",
  equipment: "equipment",
  credentials: "work_proof", // never generated (see planImageGeneration)
  other: "work_proof",
};

export interface ChannelGenerationPlan {
  channelId: GeneratedImageChannelId;
  category: ImageCategory;
  variant: ImageGenVariant;
  /** True when this channel should NOT call the model at all. */
  skip: boolean;
  reason: string;
  /** FEA-117: filename/slot identity. Defaults to the channel id; gallery
   *  fillers use their own key so several images can share a channel's
   *  machinery without overwriting each other on disk. */
  slot_key?: string;
  /** FEA-117: the concrete thing this image must show, so two images of the
   *  same category are genuinely different pictures. */
  subject?: string | null;
}

/** FEA-114 — the fix for "the generator invented a third team photo for a
 *  business that already had two". Plans ALL image channels together, once,
 *  before any of them runs:
 *
 *  - `hero_image` always generates: it is the page's headline picture and the
 *    edit-a-real-photo path (F-096/ISS-008) already prefers the business's own
 *    photo when there is a usable one.
 *  - every other channel first asks whether its own category is ALREADY
 *    covered by a real photo of the business. If it is, the channel does not
 *    produce a near-duplicate — it is redirected to the most valuable category
 *    from this trade's `generation_targets` that nothing covers yet.
 *  - if nothing is missing, the channel skips generation honestly rather than
 *    adding another variation of something the business already has.
 *
 *  `credentials` is never a generation target: an invented certificate would
 *  be a lie, not a concept image.
 *
 *  Pure apart from reading the audit's assets; exported for tests. */
export function planImageGeneration(
  auditId: string,
  trade: Trade,
  channelIds: readonly GeneratedImageChannelId[],
): ChannelGenerationPlan[] {
  const assets = listAssets(auditId);
  const policy = compositionPolicyFor(trade);
  const covered = coveredCategories(assets);
  const claimed = new Set<ImageCategory>();
  const plans = new Map<GeneratedImageChannelId, ChannelGenerationPlan>();

  // Pass 1 — every channel gets first refusal on its OWN category, so the
  // team slot keeps producing the team shot whenever the business is missing
  // one. Without this, whichever channel happened to run first could claim
  // "team" as a generic gap and leave the team slot holding a storefront.
  for (const channelId of channelIds) {
    const own = CATEGORY_BY_CHANNEL[channelId];
    if (channelId === "hero_image") {
      claimed.add(own);
      plans.set(channelId, {
        channelId,
        category: own,
        variant: "hero",
        skip: false,
        reason: "hero slot always gets its own headline image",
      });
      continue;
    }
    if (!covered.has(own) && !claimed.has(own)) {
      claimed.add(own);
      plans.set(channelId, {
        channelId,
        category: own,
        variant: VARIANT_BY_CATEGORY[own],
        skip: false,
        reason: `no real ${own} photo exists yet — generating the missing category`,
      });
    }
  }

  // Pass 2 — channels whose own category is already covered fill the most
  // valuable REMAINING gap, or honestly generate nothing.
  for (const channelId of channelIds) {
    if (plans.has(channelId)) continue;
    const own = CATEGORY_BY_CHANNEL[channelId];
    const gap = policy.generation_targets.find(
      (category) => category !== "credentials" && !covered.has(category) && !claimed.has(category),
    );
    if (gap) {
      claimed.add(gap);
      plans.set(channelId, {
        channelId,
        category: gap,
        variant: VARIANT_BY_CATEGORY[gap],
        skip: false,
        reason: `${own} is already covered by the business's own photos — redirected to the missing "${gap}"`,
      });
      continue;
    }
    plans.set(channelId, {
      channelId,
      category: own,
      variant: VARIANT_BY_CATEGORY[own],
      skip: true,
      reason: `${own} is already covered and every other shot-list category for this trade is too — nothing worth generating`,
    });
  }

  return channelIds.map((id) => plans.get(id)!);
}

/** FEA-117 — how many gallery tiles the current assets can actually produce,
 *  under the rules that will run at assembly time: originals must clear the
 *  ISS-017 curation gate, lineages collapse (ISS-035), and the hero/about
 *  slots consume their own generated images without contributing a tile. */
export function countGalleryReadyImages(auditId: string, channelPlans: readonly ChannelGenerationPlan[]): number {
  const assets = listAssets(auditId);
  const admissibleOriginals = collapseLineages(
    buildCandidates(
      assets.filter(
        (a) => (a.kind === "harvested_image" || a.kind === "uploaded_image") && curateAfterOriginal(a).include,
      ),
    ),
  ).length;
  // hero_image feeds the hero slot and team_image the about slot; anything else
  // planned (today: work_proof_images) becomes a tile.
  const generatedForGallery = channelPlans.filter(
    (p) => !p.skip && p.channelId !== "hero_image" && p.channelId !== "team_image",
  ).length;
  const existingStandalone = assets.filter(
    (a) => a.kind === "generated_image" && typeof (a.meta_json as { gallery_filler?: unknown } | null)?.gallery_filler === "boolean",
  ).length;
  return admissibleOriginals + generatedForGallery + existingStandalone;
}

/** FEA-117 — the human's rule: the gallery is never nearly empty. Plans the
 *  extra images needed to reach `policy.gallery_min`, each with a DIFFERENT
 *  category or a different concrete subject, so filling the gap produces
 *  variety rather than three angles of one bathroom.
 *
 *  Ordering: first any shot-list category the business has no coverage of at
 *  all (excluding `credentials`, never generated, and `team`, capped at one
 *  page-wide), then extra `work_result`/`craft_detail` shots anchored to
 *  DISTINCT real services. Bounded by `MAX_GALLERY_FILLERS` and by the image
 *  caps, so a business with no services can never spin up unlimited work. */
export const MAX_GALLERY_FILLERS = 4;

export function planGalleryFillers(input: {
  auditId: string;
  trade: Trade;
  services: readonly string[];
  channelPlans: readonly ChannelGenerationPlan[];
}): ChannelGenerationPlan[] {
  const policy = compositionPolicyFor(input.trade);
  const ready = countGalleryReadyImages(input.auditId, input.channelPlans);
  const missing = Math.min(policy.gallery_min - ready, MAX_GALLERY_FILLERS);
  if (missing <= 0) return [];

  const assets = listAssets(input.auditId);
  const claimed = new Set<ImageCategory>(input.channelPlans.filter((p) => !p.skip).map((p) => p.category));
  const used = new Set<string>();
  for (const asset of assets) {
    const subject = subjectOf(asset);
    if (subject) used.add(subject);
  }

  // ISS-038: subjects come from the business's own USABLE service names first,
  // then a curated per-trade library of business-relevant scenes. FEA-117
  // stopped as soon as the real service names ran out (or were unusable menu
  // debris such as "SANITÄRINSTALLATIONENSanitärinstallationen im Alt"), which
  // is what left a real audit's gallery at one image.
  const picks = pickFillerSubjects({ trade: input.trade, services: input.services, count: missing, used, claimed });

  return picks.map((pick, index) => ({
    channelId: "work_proof_images", // borrows the channel's size/machinery only
    category: pick.category,
    variant: VARIANT_BY_CATEGORY[pick.category],
    skip: false,
    reason: `gallery is short of ${policy.gallery_min} (has ${ready}) — extra ${pick.category} shot of "${pick.subject}"`,
    slot_key: `gallery_filler_${index + 1}`,
    subject: pick.subject,
  }));
}

const SIZE_BY_CHANNEL: Record<GeneratedImageChannelId, "1536x1024" | "1024x1024"> = {
  hero_image: "1536x1024",
  team_image: "1024x1024",
  work_proof_images: "1024x1024",
};

export interface GenerateChannelImageInput {
  auditId: string;
  channelId: GeneratedImageChannelId;
  trade: Trade;
  /** F-096/ISS-008: optional real-business context passed through from
   *  `BusinessInput` — grounds the generated/edited prompt in the real
   *  brand/city/service focus instead of a generic per-trade concept. */
  business?: ImageGroundingContext;
  /** Injectable client — tests pass a fake `images.generate` here. */
  client?: OpenAI;
  /** FEA-112: fired once, as soon as a partial image has been written and its
   *  asset row inserted, so the orchestrator can refresh the preview while the
   *  final frame is still rendering. */
  onPartialPublished?: (asset: AssetRecord, elapsedMs: number) => void;
  /** FEA-114: which shot-list category this channel should produce, decided
   *  for all channels together by `planImageGeneration`. Omitted → the
   *  channel's own default category/variant (pre-FEA-114 behaviour). */
  plan?: ChannelGenerationPlan;
}

export interface GenerateChannelImageResult {
  asset: AssetRecord | null;
  shot_brief: string;
  /** Extension beyond the F-051 brief's literal `{asset, shot_brief}`
   *  signature: F-053's failure ladder requires an honest error message on
   *  the channel's after_json when generation genuinely fails, and this is
   *  the only place that message exists without being swallowed. `null` on
   *  success AND on a deliberate cap-skip (a budget limit is not a failure). */
  generation_error: string | null;
  /** ISS-027: what this channel's image work actually cost (0 attempts when
   *  generation was skipped by the cap or never reached the provider). */
  timing: ImageCallTiming;
  /** FEA-114: set when generation was deliberately NOT attempted (the category
   *  is already covered by the business's own photos and nothing is missing) —
   *  a decision, not a failure. */
  skipped_reason?: string;
  /** FEA-114: the shot-list category this channel produced (or would have). */
  category?: ImageCategory;
}

function describeImageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Image generation failed: ${message}`;
}

function mimeTypeFor(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

// ---------------------------------------------------------------------------
// Shared images.edit call — used by both the hero_image edit-preferred path
// and the image_fixes channel (F-096)
// ---------------------------------------------------------------------------

interface PerformImageEditInput {
  auditId: string;
  sourceAsset: AssetRecord;
  sourcePath: string;
  prompt: string;
  size: "1024x1024" | "1536x1024";
  /** Distinguishes generated filenames/meta between callers (`hero_image` vs
   *  `image_fixes`) so two channels editing the same source photo never
   *  collide on disk. */
  filenamePrefix: string;
  channel: string;
  client: OpenAI;
}

type PerformImageEditResult =
  | { asset: AssetRecord; edit_error: null; timing: ImageCallTiming }
  | { asset: null; edit_error: string; timing: ImageCallTiming };

/** One `images.edit` call, honestly wrapped: writes the edited file under
 *  storage/generated, inserts a `label: "enhanced"` asset linked to its
 *  source via `meta_json.source_asset_id`, and never throws — any failure
 *  (including a timeout) becomes `edit_error` for the caller to handle. */
async function performImageEdit(input: PerformImageEditInput): Promise<PerformImageEditResult> {
  let call: ImageCallOutcome;
  try {
    const sourceImage = await toFile(readFileSync(input.sourcePath), basename(input.sourcePath), {
      type: mimeTypeFor(input.sourcePath),
    });
    // ISS-027: timed, with one downgrade retry before giving up.
    call = await callImageWithDowngrade("Image edit", ({ model, quality, timeoutMs, stream, partialImages }) =>
      input.client.images.edit(
        {
          model,
          image: sourceImage,
          prompt: input.prompt,
          size: input.size,
          quality,
          ...(stream ? { stream: true as const, partial_images: partialImages } : {}),
        },
        { timeout: timeoutMs },
      ),
    );
  } catch (error) {
    // Only reachable for local failures (unreadable source file) — the
    // provider call itself never throws out of callImageWithDowngrade.
    const message = error instanceof Error ? error.message : String(error);
    return { asset: null, edit_error: `Image edit failed: ${message}`, timing: EMPTY_TIMING };
  }

  if (!call.b64) return { asset: null, edit_error: `Image edit failed: ${call.error}`, timing: call.timing };

  try {
    const b64 = call.b64;
    const filename = `${input.filenamePrefix}-${input.sourceAsset.id}.png`;
    const relativePath = join("generated", input.auditId, filename);
    const filePath = join(ensureGeneratedDir(input.auditId), filename);
    writeFileSync(filePath, Buffer.from(b64, "base64"));
    const asset = insertAsset({
      audit_id: input.auditId,
      kind: "generated_image",
      storage_path: relativePath,
      meta_json: {
        prompt: input.prompt,
        size: input.size,
        channel: input.channel,
        operation: "edit",
        // ISS-035: the lineage link that makes "this is the same picture"
        // provable — an enhanced image and its source never both take a slot.
        source_asset_id: input.sourceAsset.id,
        // ISS-035: an edit does not change WHAT the picture shows, so the
        // enhanced image inherits its source's category instead of falling
        // into the unclassified bucket (where it would be quota-exempt).
        content_category: categoryOf(input.sourceAsset).category,
        content_category_confidence: categoryOf(input.sourceAsset).confidence,
        content_category_source: categoryOf(input.sourceAsset).source,
        fingerprint: await computeFingerprint(filePath),
        // ISS-027 timing telemetry
        duration_ms: call.timing.duration_ms,
        model: call.timing.model,
        quality: call.timing.quality,
        ...(call.timing.downgraded ? { downgraded_retry: true } : {}),
      },
      label: "enhanced",
      status: "generated",
    });
    return { asset, edit_error: null, timing: call.timing };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { asset: null, edit_error: `Image edit failed: ${message}`, timing: call.timing };
  }
}

/** ISS-011: an `enhanced` label must mean "genuinely derived from a real
 *  photograph". A 50×50 favicon or a 270×31 logo strip is a real ASSET but
 *  not a real PHOTO — editing it produces an almost fully invented image
 *  wearing the wrong truth label. Gate edit sources on the dimensions the
 *  harvest/upload pipeline records in meta_json; unknown dimensions stay
 *  permissive (we can't prove the source is tiny). Exported for tests. */
export const MIN_EDIT_SOURCE_SHORT_EDGE = 300;

export function isUsablePhotoSource(asset: AssetRecord): boolean {
  const meta = (asset.meta_json ?? null) as { width?: unknown; height?: unknown } | null;
  const width = typeof meta?.width === "number" ? meta.width : null;
  const height = typeof meta?.height === "number" ? meta.height : null;
  if (width === null || height === null) return true;
  return Math.min(width, height) >= MIN_EDIT_SOURCE_SHORT_EDGE;
}

type EditableSourceResult =
  | { ok: true; asset: AssetRecord; path: string }
  | { ok: false; reason: "none" | "too_small" | "text_heavy" | "wrong_content"; asset: AssetRecord | null };

/** Resolves a readable, USABLE real-photo source for an `images.edit` call.
 *  Kept separate from `performImageEdit` so callers can decide honestly
 *  between "nothing to edit" (not a failure), "only tiny logos/icons exist"
 *  (ISS-011 — also not a failure, but a distinct honest reason), a text-bearing
 *  source that would garble on edit (ISS-019), and "the edit call itself
 *  failed". */
function resolveEditableSource(auditId: string, opts: { forSlot?: "hero" } = {}): EditableSourceResult {
  // ISS-034: for the hero slot, walk the business's real photos in CONTENT
  // order (best work photo first) instead of taking one score-ranked pick.
  // With every asset unscored — the state of the audit that produced the
  // defect — the old path silently returned the first inserted row, which was
  // a snapshot of three parked vans.
  // Both edit paths now walk the business's photos in CONTENT order. The hero
  // uses the hero slot priority; the image_fixes channel uses the gallery
  // priority, which still puts real work first — it must not "enhance" a
  // screenshot just because that row happened to be inserted first.
  const policy = compositionPolicyFor(undefined);
  const candidates = rankRealPhotosForSlot(
    listAssets(auditId),
    opts.forSlot === "hero" ? policy.hero_priority : policy.gallery_priority,
  );

  if (candidates.length === 0) return { ok: false, reason: "none", asset: null };

  let lastRejection: EditableSourceResult | null = null;
  for (const { asset, classification } of candidates) {
    const path = asset.storage_path ? resolveAssetFilePath(asset.storage_path) : null;
    if (!path || !existsSync(path)) continue;
    if (!isUsablePhotoSource(asset)) {
      lastRejection ??= { ok: false, reason: "too_small", asset };
      continue;
    }
    // ISS-019: image models reliably garble text — never enhance a text-bearing
    // source (flyer, price list, service-slider graphic, screenshot); a concept
    // image is more honest than a fake, garbled "enhanced photo".
    if (isTextHeavySource(asset)) {
      lastRejection ??= { ok: false, reason: "text_heavy", asset };
      continue;
    }
    // ISS-034: never "enhance" content the classifier looked at and judged
    // unusable (screenshot, logo, map) — the reported defect enhanced an
    // uploaded Google-listing screenshot twice and made it the page hero.
    if (isKnownUnusableContent(classification)) {
      lastRejection ??= { ok: false, reason: "wrong_content", asset };
      continue;
    }
    // The hero additionally may only upgrade content that deserves to headline
    // the page — a van fleet or a certificate is not a hero, and generating a
    // real hero concept is both stronger and more honest.
    if (opts.forSlot === "hero" && !isHeroEditableCategory(classification)) {
      lastRejection ??= { ok: false, reason: "wrong_content", asset };
      continue;
    }
    return { ok: true, asset, path };
  }
  return lastRejection ?? { ok: false, reason: "none", asset: null };
}

const UNUSABLE_SOURCE_REASON =
  "no usable real photo — the site's only real images are small logos/icons (below 300px), so a concept image is more honest than a fake 'enhanced photo'.";

const TEXT_HEAVY_SOURCE_REASON =
  "the best original is a text-bearing graphic (flyer/price list/slider), which image models garble — a fresh concept image is more honest.";

// ISS-034
const WRONG_CONTENT_SOURCE_REASON =
  "the business's own photos show vehicles/equipment rather than work worth headlining — a hero concept grounded in the real services is stronger and more honest than upgrading a van shot.";

// ---------------------------------------------------------------------------
// F-096/ISS-008 · hero_image: prefer editing the business's own best photo
// ---------------------------------------------------------------------------

type HeroEditAttempt =
  | { outcome: "success"; asset: AssetRecord; timing: ImageCallTiming }
  | { outcome: "no_source" }
  | { outcome: "unusable_source"; reason: string }
  | { outcome: "capped" }
  | { outcome: "failed"; reason: string; timing: ImageCallTiming };

/** hero_image PREFERS upgrading a real business photo over inventing a
 *  concept (F-096/ISS-008). Shares the combined `GENERATED_IMAGE_CAP` budget
 *  with concept generation (never `CONCEPT_IMAGE_CAP` — an edit isn't a
 *  concept), exactly like `enhanceBestExistingImage`'s own cap check. A
 *  missing source or a failed edit is honestly reported back to the caller,
 *  which decides how to fall back — this function never fabricates an
 *  image. */
async function attemptHeroEdit(input: GenerateChannelImageInput): Promise<HeroEditAttempt> {
  if (countGeneratedImages(input.auditId) >= GENERATED_IMAGE_CAP) return { outcome: "capped" };

  const source = resolveEditableSource(input.auditId, { forSlot: "hero" });
  // ISS-011 too_small, ISS-019 text_heavy and ISS-034 wrong_content all fall
  // back to concept generation — none of them is a failure.
  if (!source.ok) {
    if (source.reason === "too_small") return { outcome: "unusable_source", reason: UNUSABLE_SOURCE_REASON };
    if (source.reason === "text_heavy") return { outcome: "unusable_source", reason: TEXT_HEAVY_SOURCE_REASON };
    if (source.reason === "wrong_content") return { outcome: "unusable_source", reason: WRONG_CONTENT_SOURCE_REASON };
    return { outcome: "no_source" };
  }

  let client: OpenAI;
  try {
    client = input.client ?? getOpenAIClient();
  } catch (error) {
    return { outcome: "failed", reason: describeImageError(error), timing: EMPTY_TIMING };
  }

  const prompt = buildHeroEditPrompt(input.trade, input.business);
  const result = await performImageEdit({
    auditId: input.auditId,
    sourceAsset: source.asset,
    sourcePath: source.path,
    prompt,
    size: "1536x1024",
    filenamePrefix: "hero_image",
    channel: "hero_image",
    client,
  });
  if (result.edit_error !== null) return { outcome: "failed", reason: result.edit_error, timing: result.timing };
  return { outcome: "success", asset: result.asset, timing: result.timing };
}

/** Generates one concept image via gpt-image-2 (F-051), or honestly declines
 *  without throwing: over the 3-per-audit cap -> brief-only; any error
 *  (missing key, API failure, bad response, timeout) -> brief-only +
 *  `generation_error` (F-053). Never fakes an image, never lets a single
 *  channel's failure stop the rest of "Do It For You".
 *
 *  F-096/ISS-008: for `hero_image` specifically, this first tries editing
 *  the business's own best real photo (see `attemptHeroEdit`) — a
 *  successful edit returns immediately, truthfully labeled `enhanced`. Any
 *  non-failure reason to skip the edit (no usable source photo, or the
 *  shared cap already reached) falls through silently to concept generation
 *  below; an actual edit *failure* falls through too (an edit failure that
 *  falls back to a successful generate is NOT a channel failure —
 *  `generation_error` stays null), but the reason is still recorded
 *  honestly on the resulting concept asset's `meta_json`. */
export async function generateChannelImage(input: GenerateChannelImageInput): Promise<GenerateChannelImageResult> {
  const shot_brief = buildShotBrief(input.channelId, input.trade);

  let heroEditFallbackReason: string | null = null;
  let timing: ImageCallTiming = EMPTY_TIMING;
  if (input.channelId === "hero_image") {
    const attempt = await attemptHeroEdit(input);
    if (attempt.outcome === "success") {
      return { asset: attempt.asset, shot_brief, generation_error: null, timing: attempt.timing };
    }
    if (attempt.outcome === "failed") {
      heroEditFallbackReason = attempt.reason;
      timing = attempt.timing;
    }
    if (attempt.outcome === "unusable_source") heroEditFallbackReason = attempt.reason;
  }

  if (countConceptImages(input.auditId) >= CONCEPT_IMAGE_CAP || countGeneratedImages(input.auditId) >= GENERATED_IMAGE_CAP) {
    return { asset: null, shot_brief, generation_error: null, timing };
  }

  let client: OpenAI;
  try {
    client = input.client ?? getOpenAIClient();
  } catch (error) {
    return { asset: null, shot_brief, generation_error: describeImageError(error), timing };
  }

  const plan = input.plan;
  if (plan?.skip) {
    return { asset: null, shot_brief, generation_error: null, timing, skipped_reason: plan.reason, category: plan.category };
  }
  const variant = plan?.variant ?? VARIANT_BY_CHANNEL[input.channelId];
  const category = plan?.category ?? CATEGORY_BY_CHANNEL[input.channelId];
  const subject = plan?.subject ?? null;
  const prompt = buildImageGenPrompt(input.trade, variant, input.business, subject);
  const size = SIZE_BY_CHANNEL[input.channelId];
  const slotKey = plan?.slot_key ?? input.channelId;

  // ISS-027/FEA-112: timed and streamed, with one same-model low-quality retry
  // before the failure ladder. `onPartial` publishes the first partial image
  // immediately (see `publishPartial`), so the page shows a real generated
  // image seconds into a call that takes ~44s to finish.
  const relativePath = join("generated", input.auditId, `${slotKey}.png`);
  const filePath = join(ensureGeneratedDir(input.auditId), `${slotKey}.png`);
  let partialAsset: AssetRecord | null = null;

  const runGeneration = (promptText: string) => callImageWithDowngrade(
    "Image generation",
    ({ model, quality, timeoutMs, stream, partialImages }) =>
      client.images.generate(
        { model, prompt: promptText, size, quality, ...(stream ? { stream: true as const, partial_images: partialImages } : {}) },
        { timeout: timeoutMs },
      ),
    {
      onPartial: (b64, elapsedMs) => {
        if (partialAsset) return; // one publish per channel; later partials just refine the file
        try {
          writeFileSync(filePath, Buffer.from(b64, "base64"));
          partialAsset = insertAsset({
            audit_id: input.auditId,
            kind: "generated_image",
            storage_path: relativePath,
            meta_json: {
              prompt,
              size,
              channel: input.channelId,
              operation: "generate",
              ...(heroEditFallbackReason ? { hero_edit_fallback_reason: heroEditFallbackReason } : {}),
              // FEA-112 truth: this row is a PARTIAL render of the very image
              // being generated — same model, same prompt, lower fidelity. It
              // is replaced in place (same id, same path) when the final frame
              // arrives; `partial_only: true` survives only if it never does.
              partial: true,
              partial_ms: elapsedMs,
              // FEA-114: a generated image knows its own category by
              // construction — it was generated to fill exactly that gap.
              content_category: category,
              content_category_confidence: 1,
              content_category_source: "generated",
              ...(subject ? { generation_subject: subject } : {}),
            },
            label: "ai_concept",
            status: "generated",
          });
          input.onPartialPublished?.(partialAsset, elapsedMs);
        } catch {
          // A failed early publish must never break the real generation — the
          // final frame writes the same path again below.
          partialAsset = null;
        }
      },
    },
  );

  let call = await runGeneration(prompt);
  timing = addTiming(timing, call.timing);

  // ISS-039: verify the frame is ONE scene. The prompt rule is the primary
  // defence; this catches the model ignoring it. Exactly one regeneration on
  // the same prompt (plus a corrective sentence), and only if that retry also
  // produces an image — a failed retry keeps the collage rather than losing the
  // channel's only picture, and says so on the record.
  let collageNote: { collage_detected: string; collage_retry: "recovered" | "still_collage" | "retry_failed" } | null = null;
  if (call.b64) {
    const verdict = await detectCollage(call.b64, { client, label: slotKey });
    if (verdict.is_collage) {
      const retry = await runGeneration(`${prompt} ${COLLAGE_CORRECTION}`);
      timing = addTiming(timing, retry.timing);
      if (retry.b64) {
        const second = await detectCollage(retry.b64, { client, label: `${slotKey}_retry` });
        call = retry;
        collageNote = { collage_detected: verdict.reason, collage_retry: second.is_collage ? "still_collage" : "recovered" };
      } else {
        collageNote = { collage_detected: verdict.reason, collage_retry: "retry_failed" };
      }
    }
  }

  if (!call.b64) {
    // FEA-112: if a partial was already published, the channel HAS a real
    // generated image (a soft one) — say so honestly instead of pretending
    // nothing was produced, and keep the failure reason on the record.
    if (partialAsset) {
      const softened = updateAsset((partialAsset as AssetRecord).id, {
        meta_json: {
          ...(((partialAsset as AssetRecord).meta_json as Record<string, unknown> | null) ?? {}),
          partial_only: true,
          final_error: call.error,
          duration_ms: call.timing.duration_ms,
          model: call.timing.model,
          quality: call.timing.quality,
        },
      });
      return { asset: softened ?? partialAsset, shot_brief, generation_error: null, timing };
    }
    return { asset: null, shot_brief, generation_error: `Image generation failed: ${call.error}`, timing };
  }

  try {
    const b64 = call.b64;
    writeFileSync(filePath, Buffer.from(b64, "base64"));

    const meta = {
      prompt,
      size,
      channel: input.channelId,
      operation: "generate",
      ...(heroEditFallbackReason ? { hero_edit_fallback_reason: heroEditFallbackReason } : {}),
      // ISS-027/FEA-112 timing telemetry
      duration_ms: call.timing.duration_ms,
      model: call.timing.model,
      quality: call.timing.quality,
      ...(call.timing.partial_ms !== null ? { partial_ms: call.timing.partial_ms } : {}),
      ...(call.timing.downgraded ? { downgraded_retry: true } : {}),
      // FEA-114 (see the partial publish above)
      content_category: category,
      content_category_confidence: 1,
      content_category_source: "generated",
      ...(subject ? { generation_subject: subject } : {}),
      // ISS-039: only present when a collage was actually detected, so the
      // evidence trail shows both the rejection and what the retry achieved.
      ...(collageNote ?? {}),
      fingerprint: await computeFingerprint(filePath),
    };

    // FEA-112: an early-published partial row is UPDATED in place (same id,
    // same path) rather than duplicated — every preview ref taken at partial
    // time keeps pointing at what is now the finished image, and the image cap
    // still counts one generated image for this channel.
    const asset = partialAsset
      ? (updateAsset((partialAsset as AssetRecord).id, { meta_json: meta }) ?? (partialAsset as AssetRecord))
      : insertAsset({
          audit_id: input.auditId,
          kind: "generated_image",
          storage_path: relativePath,
          meta_json: meta,
          label: "ai_concept",
          status: "generated",
        });

    return { asset, shot_brief, generation_error: null, timing, category };
  } catch (error) {
    return { asset: null, shot_brief, generation_error: describeImageError(error), timing, category };
  }
}

export interface EnhanceBestExistingImageInput {
  auditId: string;
  trade: Trade;
  instruction?: string;
  client?: OpenAI;
}

export interface EnhanceBestExistingImageResult {
  asset: AssetRecord | null;
  source_asset: AssetRecord | null;
  edit_error: string | null;
  /** ISS-027: see `GenerateChannelImageResult.timing`. */
  timing: ImageCallTiming;
}

/** F-096: edit the highest-scoring real photo without replacing the original.
 * The output is truthfully labeled `enhanced`, linked to its source, and
 * shares the audit-wide five-output budget with concept generation. */
export async function enhanceBestExistingImage(
  input: EnhanceBestExistingImageInput,
): Promise<EnhanceBestExistingImageResult> {
  if (countGeneratedImages(input.auditId) >= GENERATED_IMAGE_CAP) {
    return { asset: null, source_asset: null, edit_error: null, timing: EMPTY_TIMING };
  }

  const source = resolveEditableSource(input.auditId);
  if (!source.ok) {
    return {
      asset: null,
      source_asset: source.asset ?? pickBestExistingAsset(input.auditId),
      edit_error:
        source.reason === "wrong_content"
          ? "Image edit skipped: the business's own images are screenshots/vehicles/equipment rather than photographs of its work — a fresh concept image is more honest than 'enhancing' one."
          : source.reason === "too_small"
          ? "Image edit skipped: the only original images are small logos/icons (below 300px), not usable photographs — retake real photos instead."
          : source.reason === "text_heavy"
            ? "Image edit skipped: the best original is a text-heavy graphic (flyer/price list/slider), which image models garble — a fresh concept image is shown instead."
            : "Image edit failed: no readable original business photo is available.",
      timing: EMPTY_TIMING,
    };
  }

  let client: OpenAI;
  try {
    client = input.client ?? getOpenAIClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { asset: null, source_asset: source.asset, edit_error: `Image edit failed: ${message}`, timing: EMPTY_TIMING };
  }

  const prompt = input.instruction?.trim() ||
    `Improve this real ${input.trade === "other" ? "local business" : input.trade} photo for website use. Preserve the people, place, work, branding, and factual content. Correct lighting, clarity, crop, and distracting clutter only; do not invent work, credentials, customers, logos, or outcomes. Return the same single photograph, improved: ${SINGLE_SCENE_RULE}`;

  const result = await performImageEdit({
    auditId: input.auditId,
    sourceAsset: source.asset,
    sourcePath: source.path,
    prompt,
    size: "1024x1024",
    filenamePrefix: "image_fixes",
    channel: "image_fixes",
    client,
  });
  if (result.edit_error) return { asset: null, source_asset: source.asset, edit_error: result.edit_error, timing: result.timing };
  return { asset: result.asset, source_asset: source.asset, edit_error: null, timing: result.timing };
}

// ---------------------------------------------------------------------------
// image_fixes channel — per-photo instructions for real-photo edits (plan §2.5)
// ---------------------------------------------------------------------------

export interface ImageFixInstruction {
  asset_id: string | null;
  instruction: string;
}

export interface ImageFixesAfter {
  shot_brief: string;
  fixes: ImageFixInstruction[];
}

/** Turns free-text finding notes into a concrete crop/relight/replace
 *  instruction. Heuristic keyword matching (not a model call — image_fixes
 *  never generates, per plan §2.5) over the exact evidence phrasing the
 *  Visual Director already wrote (lib/rubric.ts finding derivation), so the
 *  instruction always traces back to a real observation. */
function deriveFixInstruction(note: string): string {
  const lower = note.toLowerCase();
  const actions: string[] = [];
  if (/dim|dark|underexpos|blur|noisy|low.?res|shadow/.test(lower)) actions.push("relight/sharpen");
  if (/clutter|background|tilt|crop|framing|garage/.test(lower)) actions.push("crop/reframe");
  if (/stock|generic|no human|no job|no outcome|watermark|no work/.test(lower)) actions.push("replace with a real job photo");
  if (/logo|brand|uniform|van|signage/.test(lower)) actions.push("make branding visible");
  if (actions.length === 0) actions.push("review and improve");
  return `${actions.join(" + ")} — "${note}"`;
}

/** Builds the image_fixes channel's after content: the shared shot brief
 *  (F-052) plus one instruction per flagged photo, derived from the
 *  channel's own before_json (rubric.ts `buildBeforeForChannel`'s image
 *  shape: `{asset_refs, notes}`). No asset_refs at all -> one general-purpose
 *  instruction so the channel never returns an empty fix list. */
export function buildImageFixesAfter(
  channelRow: { before_json: unknown } | undefined,
  trade: Trade,
): ImageFixesAfter {
  const before = (channelRow?.before_json ?? null) as { asset_refs?: unknown; notes?: unknown } | null;
  const assetRefs = Array.isArray(before?.asset_refs) ? (before!.asset_refs as string[]) : [];
  const notes = Array.isArray(before?.notes) ? (before!.notes as string[]) : [];

  const fixes: ImageFixInstruction[] =
    assetRefs.length > 0
      ? assetRefs.map((assetId, i) => ({
          asset_id: assetId,
          instruction: notes[i] ? deriveFixInstruction(notes[i]) : "Review for technical quality, authenticity, composition, and branding.",
        }))
      : notes.map((note) => ({ asset_id: null, instruction: deriveFixInstruction(note) }));

  return {
    shot_brief: buildShotBrief("image_fixes", trade),
    fixes:
      fixes.length > 0
        ? fixes
        : [
            {
              asset_id: null,
              instruction:
                "No specific photos flagged — general guidance: relight dim shots, crop cluttered backgrounds, and replace stock-looking photos with real job photos.",
            },
          ],
  };
}
