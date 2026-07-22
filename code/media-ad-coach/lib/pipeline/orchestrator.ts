// F-043 — Analyze orchestrator (plan §5.5, feature-breakdown F-043). Two
// branches selected by `audits.execution_mode`:
//   REPLAY (F-080): zero live calls, ever — walks the exact progress-step
//     sequence with short pacing delays, then loads the recorded fixture.
//   LIVE: the real 5-stage pipeline. Every Stage-1 evidence call is one of
//     this codebase's established "never throws" helpers (website.ts,
//     tavily.ts, images.ts, gbp.ts, memory/cognee.ts) — a soft failure there
//     (one dead portal, a Tavily outage, a screenshot the vision model
//     couldn't read) degrades honestly and is never fatal. Stage 2 (expert
//     model calls) and Stage 4 (Synthesizer) are NOT wrapped in a try/catch
//     here: a real AgentCallError there means the audit genuinely could not
//     be scored, and this function is meant to reject in that case — the
//     caller (app/api/audits/[id]/analyze/route.ts's
//     runAnalyzeAndRecordFailure) is the single place that turns a rejection
//     into `status: "failed"` + an honest `failed` progress event, so this
//     file must not duplicate or swallow that behavior.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import {
  addProgressEvent,
  getAudit,
  insertAsset,
  listAssets,
  replaceChannels,
  updateAsset,
  updateAudit,
  type AssetRecord,
  type AuditRecord,
  type ChannelInput,
} from "../db";
import { collectGbpEvidence } from "./gbp";
import { harvestImages, ingestUploadedImage, prepareImagesForVision, type HarvestResult } from "./images";
import { captureWebsiteScreenshot } from "./screenshot";
import { checkFindability } from "./tavily";
import {
  detectPlatform,
  extractContactSignals,
  extractWebsiteEvidenceFromHtml,
  fetchPortalEvidence,
  fetchWebsiteEvidence,
  imageSourcesForSinglePage,
  isEvidenceTooThin,
  withContactSignals,
  type ImageSourceMap,
} from "./website";
import {
  runCopyStrategist,
  runImageClassifier,
  runVisualDirector,
  runSynthesizer,
  type TextEvidenceItem,
  type VisualDirectorImage,
} from "../agents/experts";
import { addAuditMemory, findSimilarAudits } from "../memory/cognee";
import { classifyByHeuristic } from "../images/taxonomy";
import { prepareAssetsForClassification } from "../images/classify";
import { computeFingerprint } from "../images/fingerprint";
import { buildReport } from "../rubric";
import type {
  Asset,
  AssetKind,
  AssetLabel,
  BusinessInput,
  Channel,
  ChannelId,
  Criterion,
  FixtureAudit,
  GbpEvidence,
  ImageClassification,
  ImageClassifierOutput,
  PortalEvidence,
  PortalPlatform,
  Report,
  WebsiteEvidence,
} from "../schemas";
import replayFixtureJson from "../fixtures/replay-audit.json";

const replayFixture = replayFixtureJson as unknown as FixtureAudit;

// ---------------------------------------------------------------------------
// Shared mappers
// ---------------------------------------------------------------------------

function assetRecordToAsset(record: AssetRecord): Asset {
  return {
    id: record.id,
    audit_id: record.audit_id,
    kind: record.kind as AssetKind,
    source: record.source,
    storage_path: record.storage_path,
    meta: (record.meta_json as Record<string, unknown> | null) ?? null,
    score: (record.score_json as Criterion[] | null) ?? null,
    label: record.label as AssetLabel,
    status: record.status,
  };
}

function channelToChannelInput(channel: Channel): ChannelInput {
  return {
    id: channel.id,
    lane: channel.lane,
    title: channel.title,
    one_liner: channel.one_liner,
    priority: channel.priority,
    severity: channel.severity,
    status: channel.status,
    findings_json: channel.finding_ids,
    before_json: channel.before,
    after_json: channel.after,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// REPLAY branch (F-080) — zero live calls, ever
// ---------------------------------------------------------------------------

/** Re-read on every call (not cached) so tests can override the demo pacing
 *  delay via env, same convention as lib/agents/openai.ts's getModels(). */
function replayStepDelayMs(): number {
  const raw = process.env.REPLAY_STEP_DELAY_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 400;
}

const REPLAY_PACED_STEPS = [
  "reading_site",
  "collecting_images",
  "checking_local_search",
  "recalling_similar_audits",
  "experts_scoring",
  "building_channels",
] as const;

/** Walks the exact progress-step sequence with short pacing delays (demo
 *  feel), then loads the recorded fixture verbatim. The fixture IS the
 *  recorded result — nothing here is fabricated, and execution_mode (already
 *  REPLAY on this audit row) is left untouched so the REPLAY badge stays
 *  truthful. */
async function runReplayPipeline(auditId: string): Promise<void> {
  const stepDelay = replayStepDelayMs();
  for (const step of REPLAY_PACED_STEPS) {
    addProgressEvent(auditId, step);
    if (stepDelay > 0) await delay(stepDelay);
  }

  for (const asset of replayFixture.assets) {
    insertAsset({
      audit_id: auditId,
      kind: asset.kind,
      source: asset.source,
      storage_path: asset.storage_path,
      meta_json: {
        ...asset.meta,
        replay_fixture_asset_id: asset.id,
      },
      score_json: asset.score,
      label: asset.label,
      status: asset.status,
    });
  }

  replaceChannels(auditId, replayFixture.report.channels.map(channelToChannelInput));

  updateAudit(auditId, {
    report_json: replayFixture.report,
    overall_score: replayFixture.report.overall_score,
    status: "scored",
  });

  addProgressEvent(auditId, "done");
}

// ---------------------------------------------------------------------------
// LIVE branch — Stage 1 helpers
// ---------------------------------------------------------------------------

/** Same APP_STORAGE_DIR override convention as lib/pipeline/images.ts and
 *  lib/db.ts's APP_DB_PATH — duplicated locally (not exported/shared)
 *  because every module in this codebase that touches storage/ defines its
 *  own copy of this one-liner. */
function resolveStorageRoot(): string {
  const override = process.env.APP_STORAGE_DIR;
  if (override && override.trim().length > 0) return override;
  return join(process.cwd(), "storage");
}

/** app/api/audits/[id]/assets/route.ts (owned elsewhere) records raw-upload
 *  `storage_path` as a literal `"storage/uploads/<auditId>/<filename>"`
 *  string, NOT resolved against APP_STORAGE_DIR — that value is only correct
 *  when APP_STORAGE_DIR is unset. Reconstructing the real on-disk path from
 *  `resolveStorageRoot() + basename(storage_path)` (rather than trusting
 *  `storage_path` directly) works in every environment, including tests that
 *  override APP_STORAGE_DIR — the same workaround tests/api.test.ts already
 *  applies when it asserts against the file on disk. */
function resolveRawUploadPath(auditId: string, storagePath: string): string {
  return join(resolveStorageRoot(), "uploads", auditId, basename(storagePath));
}

async function normalizeScreenshotBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

interface RawUploadsResult {
  gbpScreenshotDataUrls: string[];
}

/**
 * F-027 — normalizes every raw-upload asset row (`uploaded_image` /
 * `gbp_screenshot`, status `"uploaded"`) left by the assets API route.
 * `uploaded_image` originals are handed to images.ts's `ingestUploadedImage`
 * (creates a new normalized row that DOES enter the scored image set, same
 * as a harvested image). `gbp_screenshot` originals are deliberately NOT
 * passed through `ingestUploadedImage` — that helper always stamps the new
 * row `kind: "uploaded_image"` (images.ts's contract), which would wrongly
 * pull a screenshot into `prepareImagesForVision`'s scored set. Screenshots
 * instead get a lightweight local resize + base64 pass and feed GBP
 * extraction only (F-025) — they never touch the assets table again. Either
 * way the original raw row is marked `"consumed"`. An unreadable/corrupt
 * file is an honest skip, never a crash, matching every other Stage-1
 * evidence helper in this codebase.
 */
async function normalizeRawUploads(auditId: string): Promise<RawUploadsResult> {
  const rawUploads = listAssets(auditId).filter(
    (a) => a.status === "uploaded" && (a.kind === "uploaded_image" || a.kind === "gbp_screenshot")
  );

  const gbpScreenshotDataUrls: string[] = [];

  for (const asset of rawUploads) {
    if (!asset.storage_path) continue;
    try {
      const buffer = readFileSync(resolveRawUploadPath(auditId, asset.storage_path));
      if (asset.kind === "uploaded_image") {
        await ingestUploadedImage(auditId, buffer, asset.source ?? "upload");
      } else {
        const normalized = await normalizeScreenshotBuffer(buffer);
        gbpScreenshotDataUrls.push(`data:image/jpeg;base64,${normalized.toString("base64")}`);
      }
      updateAsset(asset.id, { status: "consumed" });
    } catch {
      // Unreadable/corrupt raw upload — an honest skip, not a crash.
    }
  }

  return { gbpScreenshotDataUrls };
}

async function fetchAllPortals(business: BusinessInput): Promise<PortalEvidence[]> {
  const targets: { url: string; platform: PortalPlatform }[] = [];
  if (business.presence.yellow_pages) {
    targets.push({ url: business.presence.yellow_pages, platform: "yellow_pages" });
  }
  for (const url of business.presence.other ?? []) {
    targets.push({ url, platform: detectPlatform(url) });
  }

  // Promise.allSettled: fetchPortalEvidence already never throws, but this
  // keeps "one portal down is non-fatal" true even against a future bug in
  // that contract, not just today's implementation.
  const settled = await Promise.allSettled(targets.map((t) => fetchPortalEvidence(t.url, t.platform)));
  return settled
    .filter((r): r is PromiseFulfilledResult<PortalEvidence | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is PortalEvidence => v !== null);
}

/** ISS-004 — a one-line, machine-extracted summary of what the pipeline
 *  itself already detected (phones, emails, Impressum/Datenschutz, real
 *  photo count). Without this, the Copy Strategist only sees raw page text
 *  and has contradicted the pipeline's own evidence (e.g. claiming "no
 *  Impressum anywhere" while `has_impressum: true`). Kept under ~400 chars. */
function buildSiteSignalsText(website: WebsiteEvidence, realPhotoCount: number): string {
  const signals = extractContactSignals(website);
  const phoneText = signals.phones.length > 0 ? signals.phones.join(", ") : "none";
  const emailText = signals.emails.length > 0 ? signals.emails.join(", ") : "none";
  const text =
    `Phone numbers found: ${phoneText}. Email addresses found: ${emailText}. ` +
    `Impressum page: ${signals.has_impressum ? "present" : "absent"}. ` +
    `Datenschutz page: ${signals.has_datenschutz ? "present" : "absent"}. ` +
    `Real photos found on site: ${realPhotoCount}.`;
  return text.slice(0, 400);
}

/** Assembles every source-tagged text block the Copy Strategist scores
 *  against: a machine-extracted "site signals" summary (ISS-004), website
 *  sections, portal blocks, pasted text (source "manual"), and the GBP
 *  description (source = whichever precedence tier gbp.ts actually used).
 *  Labels are human-readable citation tags, not machine keys — the model
 *  only ever needs them for its own evidence citations. */
function buildTextEvidence(
  website: WebsiteEvidence | null,
  portals: readonly PortalEvidence[],
  pastedText: string | undefined,
  gbp: GbpEvidence | null,
  realPhotoCount: number
): TextEvidenceItem[] {
  const items: TextEvidenceItem[] = [];

  if (website) {
    items.push({
      source: "fetched",
      label: "site signals (machine-extracted)",
      text: buildSiteSignalsText(website, realPhotoCount),
    });
    for (const section of website.visible_text) {
      if (!section.text.trim()) continue;
      items.push({ source: website.source, label: `website ${section.section}`, text: section.text });
    }
  }

  for (const portal of portals) {
    if (!portal.visible_text.trim()) continue;
    items.push({ source: portal.source, label: `portal:${portal.platform}`, text: portal.visible_text });
  }

  if (pastedText && pastedText.trim().length > 0) {
    items.push({ source: "manual", label: "pasted text", text: pastedText });
  }

  if (gbp?.description) {
    items.push({ source: gbp.source, label: "GBP description", text: gbp.description });
  }

  return items;
}

function mergeChannelOneLiners(
  channels: readonly Channel[],
  oneLiners: readonly { channel_id: ChannelId; one_liner: string }[]
): Channel[] {
  const byId = new Map(oneLiners.map((o) => [o.channel_id, o.one_liner]));
  return channels.map((channel) => {
    const override = byId.get(channel.id);
    return override ? { ...channel, one_liner: override } : channel;
  });
}

/** "Top finding titles" for the Cognee memory summary (plan §5.7: "name,
 *  trade, city, scores, top finding titles"). Findings themselves carry no
 *  `title` field (only `criterion`/`evidence_quote`) — the closest real
 *  concept is the highest-priority channel titles, since a channel row IS
 *  the human-readable name for "what's wrong and needs fixing". Excludes the
 *  two pinned rows (optimized_site/promo_video), which are not findings. */
function topFindingTitles(channels: readonly Channel[]): string[] {
  return channels
    .filter((c) => c.id !== "optimized_site" && c.id !== "promo_video")
    .slice(0, 3)
    .map((c) => c.title);
}

// ---------------------------------------------------------------------------
// LIVE branch — the real 5-stage pipeline
// ---------------------------------------------------------------------------

/** FEA-114: writes each asset's content category onto its `meta_json`
 *  (`content_category` / `_confidence` / `_source`) so every later stage —
 *  generation gap-analysis, preview composition, the After page — reads ONE
 *  persisted decision instead of re-classifying. A failed classifier call is
 *  not fatal and is not hidden: every asset falls back to the deterministic
 *  keyword heuristic, honestly labelled `source: "heuristic"`. */
function persistImageCategories(auditId: string, outcome: PromiseSettledResult<ImageClassifierOutput>): void {
  const assets = listAssets(auditId).filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image");
  const byRef = new Map<string, ImageClassification>();
  if (outcome.status === "fulfilled") {
    for (const entry of outcome.value.images) byRef.set(entry.asset_ref, entry);
  } else {
    const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    addProgressEvent(auditId, "experts_scoring", `image classification unavailable (${message}) — falling back to keyword heuristics`);
  }

  for (const asset of assets) {
    const classified = byRef.get(asset.id);
    const resolved = classified
      ? {
          category: classified.category,
          confidence: classified.confidence,
          source: "vision" as const,
          rationale: classified.rationale,
          subject: classified.subject,
        }
      : {
          ...classifyByHeuristic(asset),
          rationale: "no vision classification — keyword heuristic over alt/src/vision evidence",
          subject: null,
        };
    updateAsset(asset.id, {
      meta_json: {
        ...((asset.meta_json as Record<string, unknown> | null) ?? {}),
        content_category: resolved.category,
        content_category_confidence: resolved.confidence,
        content_category_source: resolved.source,
        content_category_rationale: resolved.rationale,
        // ISS-034: what the classifier said it actually SAW, kept as evidence.
        content_category_subject: resolved.subject,
      },
    });
  }
}

/** ISS-035: stores a perceptual fingerprint on every real asset, so the
 *  composition layer can suppress a near-duplicate even when no lineage links
 *  the two rows. Best-effort by design: an unreadable file simply has no
 *  fingerprint, and an asset without one is never treated as a duplicate. */
async function persistImageFingerprints(auditId: string): Promise<void> {
  for (const asset of listAssets(auditId)) {
    if (asset.kind !== "harvested_image" && asset.kind !== "uploaded_image") continue;
    if (!asset.storage_path) continue;
    const meta = (asset.meta_json as Record<string, unknown> | null) ?? {};
    if (typeof meta.fingerprint === "string") continue; // already computed
    const fingerprint = await computeFingerprint(resolveAssetPath(asset.storage_path));
    if (!fingerprint) continue;
    updateAsset(asset.id, { meta_json: { ...meta, fingerprint } });
  }
}

function resolveAssetPath(storagePath: string): string {
  const root = process.env.APP_STORAGE_DIR?.trim() ? process.env.APP_STORAGE_DIR : join(process.cwd(), "storage");
  return storagePath.startsWith("/") ? storagePath : join(root, storagePath);
}

async function runLivePipeline(auditId: string, initialAudit: AuditRecord): Promise<void> {
  const business = initialAudit.business_json as BusinessInput;
  const trade = business.trade;
  const brandName = business.brand_name;

  // --- Stage 1: Evidence (plan §5.5) ---------------------------------------
  addProgressEvent(auditId, "reading_site");
  const [fetchedWebsiteResult, portals, beforeScreenshotRaw] = await Promise.all([
    business.presence.website ? fetchWebsiteEvidence(business.presence.website) : Promise.resolve(null),
    fetchAllPortals(business),
    business.presence.website
      ? captureWebsiteScreenshot({ auditId, url: business.presence.website })
      : Promise.resolve(null),
  ]);

  // ISS-012: a JS-rendered (SPA) site gives the server-side fetch ladder only
  // an empty shell, but the Playwright screenshot pass already rendered the
  // real DOM — extract evidence from it before concluding the site is empty.
  // `rendered_html` is transient: consumed here, then stripped so it never
  // bloats the persisted before_screenshot.
  let websiteEvidence = fetchedWebsiteResult?.evidence ?? null;
  // ISS-014: per-image source-page provenance carried alongside the evidence.
  let imageSources: ImageSourceMap = fetchedWebsiteResult?.imageSources ?? new Map();
  const renderedHtml = beforeScreenshotRaw?.ok ? beforeScreenshotRaw.rendered_html : undefined;
  if (business.presence.website && renderedHtml && (!websiteEvidence || isEvidenceTooThin(websiteEvidence.visible_text))) {
    const rendered = extractWebsiteEvidenceFromHtml(renderedHtml, business.presence.website);
    if (!isEvidenceTooThin(rendered.visible_text) || !websiteEvidence) {
      websiteEvidence = rendered;
      imageSources = imageSourcesForSinglePage(rendered, business.presence.website);
    }
  }
  // ISS-025: stamp the machine-extracted contact signals (plain-text phones and
  // emails, not just `tel:` hrefs) onto the final evidence so they are actually
  // persisted in evidence_json — previously they only ever reached the Copy
  // Strategist prompt and were discarded.
  if (websiteEvidence) websiteEvidence = withContactSignals(websiteEvidence);
  const beforeScreenshot = beforeScreenshotRaw?.ok
    ? (({ rendered_html: _renderedHtml, ...rest }) => rest)(beforeScreenshotRaw)
    : beforeScreenshotRaw;

  addProgressEvent(auditId, "collecting_images");
  const websiteUrl = business.presence.website;
  const [harvestResult, rawUploadsResult] = await Promise.all([
    websiteEvidence && websiteUrl
      ? harvestImages(auditId, websiteEvidence.img_candidates, websiteUrl, imageSources)
      : Promise.resolve<HarvestResult>({ assets: [], skipped_count: 0 }),
    normalizeRawUploads(auditId),
  ]);

  addProgressEvent(auditId, "checking_local_search");
  const [findability, gbpEvidence] = await Promise.all([
    checkFindability(trade, business.city, brandName),
    collectGbpEvidence({
      mapsUrl: business.presence.maps ?? null,
      gbpManual: business.gbp_manual ?? null,
      screenshotDataUrls: rawUploadsResult.gbpScreenshotDataUrls,
      brandName,
      trade,
      city: business.city ?? null,
      // FEA-101: the live Maps read is a LIVE-branch capability only. The
      // REPLAY branch never reaches this call at all, so a replayed demo can
      // never open a browser against Google.
      allowLiveFetch: true,
    }),
  ]);

  addProgressEvent(auditId, "recalling_similar_audits");
  const memoryHits = await findSimilarAudits(trade, business.city ?? null);

  // --- Stage 2: Experts (2 parallel GPT-4o structured calls) --------------
  addProgressEvent(auditId, "experts_scoring");
  const textEvidence = buildTextEvidence(
    websiteEvidence,
    portals,
    business.pasted_text,
    gbpEvidence,
    harvestResult.assets.length
  );
  const visionImages = await prepareImagesForVision(auditId);
  const assetsById = new Map(listAssets(auditId).map((a) => [a.id, a]));
  const visualDirectorImages: VisualDirectorImage[] = visionImages.map((img) => {
    const meta = assetsById.get(img.asset_id)?.meta_json as { alt?: string | null } | null;
    return meta?.alt
      ? { asset_id: img.asset_id, data_url: img.base64_data_url, alt: meta.alt }
      : { asset_id: img.asset_id, data_url: img.base64_data_url };
  });

  const [copyOutput, visualOutput, classificationOutcome] = await Promise.all([
    runCopyStrategist({ textEvidence, trade, city: business.city, findability }),
    runVisualDirector({ images: visualDirectorImages, trade }),
    // FEA-114: same images, one extra vision call — what each picture SHOWS,
    // which drives both the composition quotas and "generate only what is
    // missing". Settled rather than awaited so a classifier failure degrades
    // to the pure heuristic instead of failing the audit.
    // ISS-034: classification gets its OWN input set — every readable real
    // asset, not just the ≤8 normalized ones the scoring pass looks at. The
    // uploaded van photo that caused the defect was invisible to that set.
    Promise.allSettled([runImageClassifier({ images: prepareAssetsForClassification(auditId), trade })]).then((r) => r[0]!),
  ]);
  persistImageCategories(auditId, classificationOutcome);
  await persistImageFingerprints(auditId);

  // --- Stage 3: Rubric Engine (pure TS, F-010..F-017) ----------------------
  addProgressEvent(auditId, "building_channels");
  const scorableAssets = listAssets(auditId)
    .filter((a) => a.kind === "harvested_image" || a.kind === "uploaded_image")
    .map(assetRecordToAsset);

  const disclaimers: string[] = [];
  if (findability.status === "error") {
    disclaimers.push(
      "ASSUMPTION: local findability could not be verified live (Tavily search failed or is unavailable) — findability-derived context is not confirmed."
    );
  }
  // ISS-012: never let "we couldn't read the site" masquerade as "the site
  // has nothing" — when a website URL was provided but every evidence path
  // (fetch ladder, Tavily, rendered DOM) came back empty, say so explicitly.
  if (business.presence.website && !websiteEvidence) {
    disclaimers.push(
      "ASSUMPTION: the website could not be read (unreachable, blocked, or JS-only without extractable content) — website-related findings reflect missing evidence, not verified absence."
    );
  }

  const reportBase = buildReport({
    business,
    websiteEvidence,
    portals,
    gbp: gbpEvidence,
    findability,
    copyOutput,
    visualOutput,
    assets: scorableAssets,
    executionMode: "LIVE",
    disclaimers,
  });

  // --- Stage 4: Synthesizer (may NOT change any number) --------------------
  const synthesizerOutput = await runSynthesizer({ report: reportBase, memoryHits });
  const channels = mergeChannelOneLiners(reportBase.channels, synthesizerOutput.channel_one_liners);
  const report: Report = {
    ...reportBase,
    channels,
    executive_summary: synthesizerOutput.executive_summary,
    memory_note: synthesizerOutput.memory_note,
  };

  // --- Stage 5: persist ------------------------------------------------------
  replaceChannels(auditId, channels.map(channelToChannelInput));
  updateAudit(auditId, {
    evidence_json: {
      website: websiteEvidence,
      portals,
      gbp: gbpEvidence,
      findability,
      before_screenshot: beforeScreenshot,
      images_skipped_count: harvestResult.skipped_count,
    },
    report_json: report,
    overall_score: report.overall_score,
    status: "scored",
  });
  addProgressEvent(auditId, "done");

  // Fire-and-forget — addAuditMemory never throws and never blocks completion.
  void addAuditMemory({
    audit_id: auditId,
    brand_name: brandName,
    trade,
    city: business.city,
    overall_score: report.overall_score,
    text_score: report.text.score,
    image_score: report.images.score,
    top_finding_titles: topFindingTitles(channels),
    weaknesses: channels
      .filter((channel) => channel.id !== "optimized_site" && channel.id !== "promo_video")
      .map((channel) => ({
        channel_id: channel.id,
        title: channel.title,
        lane: channel.lane,
        severity: channel.severity,
      })),
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runAnalyzePipeline(auditId: string): Promise<void> {
  const audit = getAudit(auditId);
  if (!audit) {
    throw new Error(`No audit found with id "${auditId}".`);
  }

  if (audit.execution_mode === "REPLAY") {
    await runReplayPipeline(auditId);
    return;
  }

  await runLivePipeline(auditId, audit);
}
