/**
 * F-045/F-055 — "Do It For You" orchestration (plan §4.1/§5.5 IMPROVE).
 *
 * `runImprove` is the single engine behind both page buttons ("Improve It"
 * on one channel, "Do It For You" on `"all"`) — the route (F-045) only
 * validates the request and fires this. Progress steps are emitted in the
 * exact fixed order `rewriting_text -> generating_images ->
 * assembling_preview -> done` (lib/schemas.ts `ImproveProgressStep`)
 * regardless of the selection or of partial failures, so the frontend poller
 * never sees an unrecognized step. Failure honesty (plan §4.3 failure
 * ladder, F-053): a channel that genuinely errors goes back to "todo" with
 * an honest progress event and the run continues; only a *total* wipeout of
 * everything requested for this run sends the audit status back to
 * "scored" — improve never marks the audit "failed", the report stays valid.
 */
import type OpenAI from "openai";
import {
  addProgressEvent,
  getAudit,
  listChannels,
  updateAsset,
  updateAudit,
  updateChannelStatus,
  type ChannelRecord,
} from "../db";
import { ChannelId, TextChannelId, type BusinessInput, type FixtureAudit } from "../schemas";
import { parseServices } from "../agents/prompts";
import rawReplayFixture from "../fixtures/replay-audit.json";
import { improveTextChannels, type ImproveTextChannelInput } from "./text";
import {
  buildImageFixesAfter,
  buildShotBrief,
  describeImageTiming,
  enhanceBestExistingImage,
  generateChannelImage,
  pickBestExistingAsset,
  planGalleryFillers,
  planImageGeneration,
  type GeneratedImageChannelId,
} from "./image";
import { assemblePreview, explainComposition } from "./preview";
import { filterGalleryByCuration, recordAfterCuration } from "./curate";

const replayFixture = rawReplayFixture as unknown as FixtureAudit;

export type ChannelSelection = string[] | "all";

// ISS-016: enumerate the business's ACTUAL services for service-level image
// prompts — from the user-declared background AND the scraped website evidence
// (services/hero/about copy is where offerings live). Read defensively: the
// evidence_json blob shape is owned by the analyze lane and may be absent.
const SERVICE_EVIDENCE_SECTIONS = new Set(["services", "hero", "about"]);

function deriveBusinessServices(auditId: string, business: BusinessInput): string[] {
  const evidence = getAudit(auditId)?.evidence_json as
    | { website?: { visible_text?: { section?: string; text?: string }[] | null } | null }
    | null;
  const scraped = (evidence?.website?.visible_text ?? [])
    .filter((s) => s && typeof s.text === "string" && SERVICE_EVIDENCE_SECTIONS.has(String(s.section)))
    .map((s) => s.text as string)
    .join(". ");

  const seen = new Set<string>();
  const services: string[] = [];
  for (const svc of [...parseServices(business.background), ...parseServices(scraped)]) {
    const key = svc.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      services.push(svc);
    }
  }
  return services.slice(0, 6);
}

const TEXT_CHANNEL_IDS = new Set<string>(TextChannelId.options);
const GENERATED_IMAGE_CHANNEL_IDS = new Set<string>(["hero_image", "team_image", "work_proof_images"]);
const VALID_CHANNEL_IDS = new Set<string>(ChannelId.options);

export interface RunImproveOptions {
  /** Injectable OpenAI client — tests pass a fake `chat.completions.create`
   *  (text) and `images.generate` (image) here so no network access or
   *  OPENAI_API_KEY is ever needed to exercise this module. */
  client?: OpenAI;
  /** Test-only: overrides the REPLAY branch's per-stage pacing delay (ms).
   *  Defaults to ~400ms (plan §5.5's "staged progress pacing"). */
  replayStepDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Selection resolution
// ---------------------------------------------------------------------------

/** `"all"` -> every channel currently `todo` in a text/image lane (never
 *  `optimized_site`/`promo_video` — those aren't run through a rewrite/
 *  generation step). An explicit array -> exactly the requested ids that are
 *  (a) a real `ChannelId`, (b) not the two non-actionable pinned ids, and
 *  (c) actually present as a row for this audit — and, unlike `"all"`,
 *  regardless of current status, so re-selecting an already-`improved`
 *  channel deliberately re-runs it (plan §4.1: "allow re-improve single
 *  channels after complete"). The route (F-045) already validates the
 *  request shape; this stays defensive so `runImprove` is safe to call
 *  directly (as the test suite does) without going through the route. */
function resolveTargetChannelIds(channels: ChannelRecord[], selection: ChannelSelection): string[] {
  if (selection === "all") {
    return channels.filter((c) => c.status === "todo" && (c.lane === "text" || c.lane === "image")).map((c) => c.id);
  }
  const existingIds = new Set(channels.map((c) => c.id));
  return selection.filter(
    (id) => VALID_CHANNEL_IDS.has(id) && id !== "optimized_site" && id !== "promo_video" && existingIds.has(id),
  );
}

/** `optimized_site` has no rewrite/generation step of its own — it improves
 *  "implicitly via preview assembly" (plan §4.1). Assembly runs for `"all"`,
 *  or when the caller explicitly asks for `optimized_site` (a manual
 *  re-assembly trigger, e.g. after fixing one channel post-completion).
 *
 *  ISS-040: this predicate is ALSO the honest definition of "is this a full
 *  page rebuild?", which is the question FEA-117's gallery fillers actually
 *  depend on. The page's After gallery is (re)built exactly when preview
 *  assembly runs, so "the gallery must not look empty" applies exactly then.
 *  Deciding it from the literal `"all"` instead was the defect: the real
 *  "Do It All For You" button (FEA-111) posts an explicit ARRAY of every todo
 *  channel — `optimized_site` included — so it rebuilt the whole page while
 *  `selection === "all"` was false and the gallery was never filled. */
function isFullPageRun(selection: ChannelSelection): boolean {
  if (selection === "all") return true;
  return selection.includes("optimized_site");
}

/** Text channels' `before_json` is always `{excerpts: string[]}` at ANALYZE
 *  time (lib/rubric.ts `buildBeforeForChannel`, text lane). Joins them into
 *  one string as the rewrite call's "original text". Falls back to a couple
 *  of other plausible single-string keys defensively (e.g. a hand-authored
 *  fixture using a different shape) rather than sending the rewriter nothing
 *  when the real shape doesn't match. */
function extractOriginalText(before: unknown): string {
  if (!before || typeof before !== "object") return "";
  const record = before as Record<string, unknown>;
  if (Array.isArray(record.excerpts)) {
    return (record.excerpts as unknown[]).map(String).join("\n");
  }
  if (typeof record.current_text === "string") return record.current_text;
  if (typeof record.current_h1 === "string") return record.current_h1;
  if (typeof record.current_cta === "string") return record.current_cta;
  return "";
}

function buildTextInputs(
  auditId: string,
  targetIds: string[],
  channelById: Map<string, ChannelRecord>,
  business: BusinessInput,
  client: OpenAI | undefined,
): ImproveTextChannelInput[] {
  return targetIds
    .filter((id): id is TextChannelId => TEXT_CHANNEL_IDS.has(id))
    .map((id) => {
      const channel = channelById.get(id)!;
      return {
        auditId,
        channelId: id,
        channelRow: { findings_json: channel.findings_json, before_json: channel.before_json },
        business: { trade: business.trade, city: business.city ?? null, brand_name: business.brand_name },
        originalText: extractOriginalText(channel.before_json),
        client,
      };
    });
}

// ---------------------------------------------------------------------------
// LIVE branch
// ---------------------------------------------------------------------------

/** FEA-112: re-assembles and persists `preview_json` from whatever is in the
 *  DB right now. Called every time an image lands (partial or final) so the
 *  optimized page picks up each new image on its own instead of waiting for the
 *  slowest one. `assemblePreview` is pure DB reads (F-054) and never throws on
 *  partial state, but this stays defensive: a preview refresh must never take
 *  down an image task that has already succeeded. */
function refreshPreview(auditId: string, assembleAtEnd: boolean): void {
  if (!assembleAtEnd) return;
  try {
    recordAfterCuration(auditId);
    const preview = assemblePreview(auditId);
    updateAudit(auditId, { preview_json: preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addProgressEvent(auditId, "assembling_preview", `preview refresh skipped: ${message}`);
  }
}

async function runLiveImprove(
  auditId: string,
  targetIds: string[],
  /** ISS-040: ONE flag for one question — is this run rebuilding the whole
   *  After page? It decides both the closing preview assembly and (FEA-117)
   *  whether the gallery is topped up to its minimum. Improving ONE channel
   *  stays cheap and predictable: no assembly, no extra generations for a page
   *  the visitor did not ask to rebuild. Two separate flags were the ISS-040
   *  defect — the one-click button rebuilt the page with fillers switched off. */
  fullPageRun: boolean,
  business: BusinessInput,
  channels: ChannelRecord[],
  client: OpenAI | undefined,
): Promise<void> {
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const succeededIds = new Set<string>();

  // --- rewriting_text ---
  addProgressEvent(auditId, "rewriting_text");
  const textInputs = buildTextInputs(auditId, targetIds, channelById, business, client);
  for (const input of textInputs) updateChannelStatus(auditId, input.channelId, "improving");
  if (textInputs.length > 0) {
    const outcomes = await improveTextChannels(textInputs, 5);
    for (const outcome of outcomes) {
      if (outcome.status === "success") {
        // Persist the full validated RewriteOutput (channel_id/before_excerpt/
        // after/rationale_one_liner) as-is — see docs card: the frontend's
        // inline reveal wants the rationale and excerpt alongside `after`,
        // not just the bare channel-specific fields.
        updateChannelStatus(auditId, outcome.input.channelId, "improved", outcome.result);
        succeededIds.add(outcome.input.channelId);
      } else {
        updateChannelStatus(auditId, outcome.input.channelId, "todo");
        const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
        addProgressEvent(auditId, "rewriting_text", `"${outcome.input.channelId}" failed to rewrite: ${message}`);
      }
    }
  }

  // --- generating_images ---
  // ISS-006: every image-channel call (up to 3 concept/edit generations plus
  // the image_fixes edit) runs CONCURRENTLY instead of one-by-one, so this
  // stage's wall-clock is ~the slowest single call instead of their sum.
  // Each channel is flipped to "improving" up front, then independently to
  // "improved" as its own result settles — failure honesty (F-053) and the
  // fixed progress-step order are unchanged; only the awaiting is parallel.
  addProgressEvent(auditId, "generating_images");
  const imageTargetIds = targetIds.filter((id): id is GeneratedImageChannelId => GENERATED_IMAGE_CHANNEL_IDS.has(id));
  const wantsImageFixes = targetIds.includes("image_fixes");
  const businessContext = {
    brand_name: business.brand_name,
    city: business.city,
    background: business.background,
    // ISS-016: real, enumerated services (declared + scraped) drive
    // service-level, ad-grade image prompts.
    services: deriveBusinessServices(auditId, business),
  };

  for (const id of imageTargetIds) updateChannelStatus(auditId, id, "improving");
  if (wantsImageFixes) updateChannelStatus(auditId, "image_fixes", "improving");
  let imagesInFlight = imageTargetIds.length + (wantsImageFixes ? 1 : 0);

  // FEA-114: decide what every image channel should produce BEFORE any of them
  // runs, so two channels can never both "fill the gap" with the same category
  // and no channel generates a near-duplicate of a category the business
  // already has real photos of.
  const generationPlans = new Map(
    planImageGeneration(auditId, business.trade, imageTargetIds).map((plan) => [plan.channelId, plan]),
  );
  for (const plan of generationPlans.values()) {
    addProgressEvent(auditId, "generating_images", `"${plan.channelId}" → ${plan.skip ? "skipped" : plan.category}: ${plan.reason}`);
  }

  // FEA-117: the gallery must not look empty. Whatever the channels above will
  // not produce, and the business's own photos cannot supply (they may all be
  // 120px thumbnails), is filled with EXTRA generated images — each a different
  // category or a different concrete service, never another angle of the same
  // scene.
  const fillerPlans = fullPageRun
    ? planGalleryFillers({
        auditId,
        trade: business.trade,
        services: businessContext.services,
        channelPlans: [...generationPlans.values()],
      })
    : [];
  // ISS-038: ALWAYS record the gallery decision, including "nothing needed".
  // The reported failure produced no gallery line at all, which is what proved
  // the running server was serving a build from before FEA-117 rather than
  // hitting a planning edge case.
  if (fullPageRun) {
    addProgressEvent(
      auditId,
      "generating_images",
      `gallery plan: ${fillerPlans.length} filler${fillerPlans.length === 1 ? "" : "s"} queued to reach the minimum`,
    );
  }
  for (const plan of fillerPlans) {
    addProgressEvent(auditId, "generating_images", `"${plan.slot_key}" → ${plan.category}: ${plan.reason}`);
  }
  imagesInFlight += fillerPlans.length;

  const imageWork: Promise<void>[] = imageTargetIds.map((id) =>
    (async () => {
      try {
        const result = await generateChannelImage({
          auditId,
          channelId: id,
          trade: business.trade,
          business: businessContext,
          client,
          plan: generationPlans.get(id),
          // FEA-112: a streamed partial is a real generated image of this very
          // channel, just softer. Publish it against the channel immediately —
          // status stays "improving" (the UI keeps saying "generating"), but
          // the After page can already show it instead of the customer's old
          // photo. The final frame overwrites the same asset id in place.
          onPartialPublished: (asset, elapsedMs) => {
            updateChannelStatus(auditId, id, "improving", {
              shot_brief: buildShotBrief(id, business.trade),
              best_existing_asset_id: pickBestExistingAsset(auditId)?.id ?? null,
              generated_asset_id: asset.id,
              generation_error: null,
              partial: true,
            });
            addProgressEvent(auditId, "generating_images", `"${id}" first partial image after ${(elapsedMs / 1000).toFixed(1)}s`);
            refreshPreview(auditId, fullPageRun);
          },
        });
        const best = pickBestExistingAsset(auditId);
        updateChannelStatus(auditId, id, "improved", {
          shot_brief: result.shot_brief,
          best_existing_asset_id: best?.id ?? null,
          generated_asset_id: result.asset?.id ?? null,
          generation_error: result.generation_error,
          // FEA-114: what this channel was asked to produce, and — when it
          // produced nothing — the honest reason it was a decision rather than
          // a failure.
          ...(result.category ? { content_category: result.category } : {}),
          ...(result.skipped_reason ? { skipped_reason: result.skipped_reason } : {}),
        });
        // ISS-027: the real per-image cost lands in the audit's own progress
        // events (success AND failure), so "every image hit the 120s timeout"
        // is visible in the run's evidence instead of needing a side
        // measurement. Silent only when no provider call was made at all
        // (cap-skip) — a budget skip has no duration to report.
        if (result.skipped_reason) {
          addProgressEvent(auditId, "generating_images", `"${id}" image not generated — ${result.skipped_reason}`);
        } else if (result.timing.attempts > 0 || result.generation_error) {
          const cost = result.timing.attempts > 0 ? ` in ${describeImageTiming(result.timing)}` : "";
          addProgressEvent(
            auditId,
            "generating_images",
            result.generation_error ? `"${id}" image failed${cost}: ${result.generation_error}` : `"${id}" image ready${cost}`,
          );
        }
        // FEA-112: one image landing refreshes the live preview on its own —
        // "finish one, store one, show one" instead of one big reveal at the end.
        refreshPreview(auditId, fullPageRun);
      } catch (error) {
        // Defensive only: generateChannelImage never throws by contract, but
        // this stage must never let one bad channel take the rest down.
        const message = error instanceof Error ? error.message : String(error);
        updateChannelStatus(auditId, id, "improved", {
          shot_brief: buildShotBrief(id, business.trade),
          best_existing_asset_id: null,
          generated_asset_id: null,
          generation_error: `Image generation failed: ${message}`,
        });
      }
      // F-053: a failed/capped generation still ends "improved" (shot brief +
      // fallback delivered honestly) — it counts as a successful channel run,
      // never a wipeout contributor, and it never blocks the rest.
      succeededIds.add(id);
    })(),
  );

  // FEA-117: filler images run as background tasks exactly like the channel
  // images (FEA-112) — streamed, published one by one, each landing refreshing
  // the live preview. They belong to no channel, so nothing else changes.
  for (const plan of fillerPlans) {
    imageWork.push(
      (async () => {
        try {
          const result = await generateChannelImage({
            auditId,
            channelId: plan.channelId,
            trade: business.trade,
            business: businessContext,
            client,
            plan,
            onPartialPublished: () => refreshPreview(auditId, fullPageRun),
          });
          if (result.generation_error) {
            addProgressEvent(auditId, "generating_images", `"${plan.slot_key}" filler failed: ${result.generation_error}`);
          } else if (result.asset) {
            updateAsset(result.asset.id, {
              meta_json: { ...((result.asset.meta_json as Record<string, unknown> | null) ?? {}), gallery_filler: true },
            });
            addProgressEvent(
              auditId,
              "generating_images",
              `"${plan.slot_key}" filler ready in ${describeImageTiming(result.timing)} (${plan.category}${plan.subject ? `: ${plan.subject}` : ""})`,
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addProgressEvent(auditId, "generating_images", `"${plan.slot_key}" filler failed: ${message}`);
        }
        refreshPreview(auditId, fullPageRun);
      })(),
    );
  }

  if (wantsImageFixes) {
    imageWork.push(
      (async () => {
        const guidance = buildImageFixesAfter(channelById.get("image_fixes"), business.trade);
        try {
          const edit = await enhanceBestExistingImage({ auditId, trade: business.trade, client });
          updateChannelStatus(auditId, "image_fixes", "improved", {
            ...guidance,
            source_asset_id: edit.source_asset?.id ?? null,
            enhanced_asset_id: edit.asset?.id ?? null,
            edit_error: edit.edit_error,
          });
          const cost = edit.timing.attempts > 0 ? ` (${describeImageTiming(edit.timing)})` : "";
          if (edit.edit_error) {
            addProgressEvent(auditId, "generating_images", `"image_fixes" could not enhance a real photo${cost}: ${edit.edit_error}`);
          } else if (edit.timing.attempts > 0) {
            addProgressEvent(auditId, "generating_images", `"image_fixes" enhanced a real photo in ${describeImageTiming(edit.timing)}`);
          }
        } catch (error) {
          // Defensive only: enhanceBestExistingImage never throws by
          // contract; see the matching catch above.
          const message = error instanceof Error ? error.message : String(error);
          updateChannelStatus(auditId, "image_fixes", "improved", {
            ...guidance,
            source_asset_id: null,
            enhanced_asset_id: null,
            edit_error: `Image edit failed: ${message}`,
          });
          addProgressEvent(auditId, "generating_images", `"image_fixes" could not enhance a real photo: ${message}`);
        }
        // The deterministic, evidence-backed fix instructions remain useful
        // if no original is readable or the edit call fails, so the channel
        // still truthfully completes instead of losing its fallback
        // deliverable.
        succeededIds.add("image_fixes");
        refreshPreview(auditId, fullPageRun);
      })(),
    );
  }

  // --- assembling_preview (FEA-112: BEFORE the images, not after) ----------
  // Human decision 2026-07-21: gpt-image-2 stays for quality, and its latency
  // (measured 38.5s–>500s for the SAME hero call) is absorbed by the flow
  // instead of by the visitor. The text rewrites are already done, so the
  // report and the optimized page are assembled and marked complete NOW; the
  // image tasks above keep running against this same audit and each one
  // refreshes the preview as it lands. Image channels stay `improving`, which
  // is what the UI renders as an honest "generating" placeholder.
  const textWipeout = textInputs.length > 0 && succeededIds.size === 0 && imageTargetIds.length === 0 && !wantsImageFixes;
  addProgressEvent(
    auditId,
    "assembling_preview",
    imagesInFlight > 0 ? `text ready — ${imagesInFlight} image${imagesInFlight === 1 ? "" : "s"} still generating` : undefined,
  );
  if (fullPageRun && !textWipeout) {
    // ISS-017: persist each original's After-selection reason before assembly
    // so the After-page UI can label/group the surviving originals.
    recordAfterCuration(auditId);
    const preview = assemblePreview(auditId);
    updateAudit(auditId, { preview_json: preview, status: "complete" });
    updateChannelStatus(auditId, "optimized_site", "improved");
  } else if (textWipeout) {
    addProgressEvent(auditId, "assembling_preview", "every requested channel failed to improve — nothing new to assemble.");
    updateAudit(auditId, { status: "scored" });
  } else {
    const existingPreview = getAudit(auditId)?.preview_json;
    updateAudit(auditId, { status: existingPreview ? "complete" : "scored" });
  }

  // The audit is usable from here on. Everything below only sharpens it.
  await Promise.allSettled(imageWork);

  if (imagesInFlight > 0) {
    refreshPreview(auditId, fullPageRun);
    addProgressEvent(auditId, "assembling_preview", `preview refreshed with the finished image${imagesInFlight === 1 ? "" : "s"}`);
    // FEA-114: the final composition, slot by slot, so the picture choice is
    // auditable after the fact instead of being an opaque ranking.
    if (fullPageRun) {
      const composition = explainComposition(auditId)
        .map((d) => `${d.slot}=${d.category}`)
        .join(", ");
      if (composition) addProgressEvent(auditId, "assembling_preview", `composition: ${composition}`);
    }
    const stillEmpty = targetIds.length > 0 && succeededIds.size === 0;
    if (stillEmpty) updateAudit(auditId, { status: "scored" });
  }

  addProgressEvent(auditId, "done");
}

// ---------------------------------------------------------------------------
// REPLAY branch — no model calls, ever
// ---------------------------------------------------------------------------

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Flips a channel to `improved` with the fixture's recorded after content
 *  when one exists; otherwise leaves it `todo` and logs an honest progress
 *  event instead of fabricating an improvement (plan: "REPLAY ... design so
 *  it just works when preview_json/afters appear" — today's F-081 skeleton
 *  fixture has every channel's `after: null`, so this path is what actually
 *  runs until F-082 records a full fixture). */
function applyReplayChannel(auditId: string, channelId: string, recordedAfter: unknown, step: "rewriting_text" | "generating_images"): void {
  if (recordedAfter !== null && recordedAfter !== undefined) {
    updateChannelStatus(auditId, channelId, "improved", recordedAfter);
  } else {
    addProgressEvent(auditId, step, `replay fixture has no recorded improvement for ${channelId}`);
  }
}

async function runReplayImprove(
  auditId: string,
  targetIds: string[],
  assembleAtEnd: boolean,
  stepDelayMs: number,
): Promise<void> {
  const fixtureAfterById = new Map<string, unknown>(replayFixture.report.channels.map((c) => [c.id, c.after]));

  addProgressEvent(auditId, "rewriting_text");
  await delay(stepDelayMs);
  for (const id of targetIds.filter((i) => TEXT_CHANNEL_IDS.has(i))) {
    applyReplayChannel(auditId, id, fixtureAfterById.get(id) ?? null, "rewriting_text");
  }

  addProgressEvent(auditId, "generating_images");
  await delay(stepDelayMs);
  for (const id of targetIds.filter((i) => GENERATED_IMAGE_CHANNEL_IDS.has(i) || i === "image_fixes")) {
    applyReplayChannel(auditId, id, fixtureAfterById.get(id) ?? null, "generating_images");
  }

  addProgressEvent(auditId, "assembling_preview");
  await delay(stepDelayMs);
  if (assembleAtEnd) {
    // ISS-017: the baked fixture preview was recorded before the After-curation
    // policy; re-apply it to the baked gallery so REPLAY also shows no weak old
    // photos. A freshly assembled preview is already curated by resolveGallery.
    // ISS-020: also persist each original's after_curation (group + reason) so
    // the After-page credentials block (FEA-110 / ISS-018) receives the same
    // decision in REPLAY that it does in a LIVE run — previously absent.
    recordAfterCuration(auditId);
    const baked = replayFixture.preview_json;
    const preview = baked
      ? { ...baked, gallery: filterGalleryByCuration(auditId, baked.gallery) }
      : assemblePreview(auditId);
    updateAudit(auditId, { preview_json: preview, status: "complete" });
    updateChannelStatus(auditId, "optimized_site", "improved");
  } else {
    const existingPreview = getAudit(auditId)?.preview_json;
    updateAudit(auditId, { status: existingPreview ? "complete" : "scored" });
  }

  addProgressEvent(auditId, "done");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const DEFAULT_REPLAY_STEP_DELAY_MS = 400;

/** Runs "Do It For You" for one channel or `"all"` (plan §4.1/F-045). Flips
 *  the audit to `improving` synchronously (before the first `await`) so even
 *  an un-awaited caller — the route fires this and returns immediately —
 *  observes the status flip right away. Never throws: every failure mode
 *  documented above is handled inline and recorded as an honest progress
 *  event/status, matching the rest of this codebase's "never hide a failure"
 *  rule (docs/CONTRACTS.md, AGENTS.md hard rule 3). */
export async function runImprove(auditId: string, selection: ChannelSelection, opts: RunImproveOptions = {}): Promise<void> {
  const audit = getAudit(auditId);
  if (!audit) return; // defensive: the route already checks existence before calling this

  updateAudit(auditId, { status: "improving" });

  const business = audit.business_json as BusinessInput;
  const channels = listChannels(auditId);
  const targetIds = resolveTargetChannelIds(channels, selection);
  // ISS-040: one question, one answer — a full page rebuild both assembles the
  // preview and owes the visitor a complete gallery. Improving ONE channel does
  // neither.
  const fullPageRun = isFullPageRun(selection);

  if (audit.execution_mode === "REPLAY") {
    await runReplayImprove(auditId, targetIds, fullPageRun, opts.replayStepDelayMs ?? DEFAULT_REPLAY_STEP_DELAY_MS);
    return;
  }

  await runLiveImprove(auditId, targetIds, fullPageRun, business, channels, opts.client);
}
