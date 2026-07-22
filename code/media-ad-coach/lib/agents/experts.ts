/**
 * F-032/F-033/F-034 — Expert agents (plan §5.5 Stage 2/4, Appendix B).
 *
 * Each exported `run*` function takes fully-prepared inputs (evidence text
 * blocks, base64 image data URLs) as arguments — it does not fetch, harvest,
 * or persist anything. The wave-2 orchestrator (lib/pipeline/*, not owned
 * here) is responsible for assembling those inputs and wiring the outputs
 * into the rubric engine and the persisted Report.
 */
import { getModels, structuredCall } from "./openai";
import {
  COPY_STRATEGIST_SYSTEM,
  GBP_EXTRACTION_SYSTEM,
  IMAGE_CLASSIFIER_SYSTEM,
  SYNTHESIZER_SYSTEM,
  VISUAL_DIRECTOR_SYSTEM,
} from "./prompts";
import {
  CopyStrategistOutput,
  CoverageGap,
  GbpExtractionOutput,
  ImageClassifierOutput,
  SynthesizerOutput,
  VisualDirectorOutput,
  type Report,
  type TavilyFindability,
  type Trade,
} from "../schemas";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";

// ---------------------------------------------------------------------------
// Copy Strategist (F-032)
// ---------------------------------------------------------------------------

export interface TextEvidenceItem {
  /** Acquisition/origin tag, e.g. "fetched" | "tavily" | "manual" | "screenshot"
   *  (mirrors WebsiteEvidence.source / PortalEvidence.source / GbpEvidence.source)
   *  — carried straight into the matching Criterion.source when the model
   *  quotes this block. */
  source: string;
  /** Human-readable label for citation, e.g. "website:hero", "portal:yellow_pages". */
  label: string;
  text: string;
}

export interface RunCopyStrategistInput {
  textEvidence: TextEvidenceItem[];
  trade: Trade;
  city?: string | null;
  findability: TavilyFindability | null;
}

const TEXT_CRITERION_IDS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"] as const;

/** Zero text evidence → deterministic all-absent output, no model call (plan
 *  F-032 acceptance note: the pipeline must work without any text). */
function buildAbsentCopyStrategistOutput(): CopyStrategistOutput {
  return {
    criteria: TEXT_CRITERION_IDS.map((id) => ({
      id,
      score: 0,
      evidence: "No text evidence was available for this business.",
      source: "absent" as const,
    })),
    findings: [],
  };
}

function describeFindability(findability: TavilyFindability | null): string {
  if (!findability) return "not checked";
  if (findability.results.length === 0) return findability.status;
  const results = findability.results.map((r) => `"${r.title}" (${r.url})`).join("; ");
  return `${findability.status} — results: ${results}`;
}

function buildCopyStrategistUserContent(input: RunCopyStrategistInput): string {
  const header = [
    `Business trade: ${input.trade}`,
    `City: ${input.city ?? "unknown"}`,
    `Findability (Tavily search "{trade} {city}"): ${describeFindability(input.findability)}`,
  ].join("\n");

  const evidenceBlocks = input.textEvidence
    .map((e, i) => `--- Evidence #${i + 1} [source=${e.source}, label=${e.label}] ---\n${e.text}`)
    .join("\n\n");

  return `${header}\n\nExtracted text evidence (quote directly from these blocks; use no other knowledge):\n\n${evidenceBlocks}`;
}

/** One structured call scoring T1-T8 against ALL extracted text evidence
 *  (website sections + portal blocks + pasted text + GBP description). */
export async function runCopyStrategist(input: RunCopyStrategistInput): Promise<CopyStrategistOutput> {
  if (input.textEvidence.length === 0) {
    return buildAbsentCopyStrategistOutput();
  }

  return structuredCall({
    schema: CopyStrategistOutput,
    schemaName: "copy_strategist_output",
    system: COPY_STRATEGIST_SYSTEM,
    user: buildCopyStrategistUserContent(input),
    stage: "copy_strategist",
  });
}

// ---------------------------------------------------------------------------
// Visual Director (F-033)
// ---------------------------------------------------------------------------

export interface VisualDirectorImage {
  asset_id: string;
  data_url: string;
  alt?: string;
}

export interface RunVisualDirectorInput {
  images: VisualDirectorImage[];
  trade: Trade;
}

const ALL_COVERAGE_GAPS = CoverageGap.options; // ["hero_shot","team_shot","work_proof_shot","branding_shot"]
const VISUAL_DIRECTOR_BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function buildVisualDirectorUserContent(batch: VisualDirectorImage[], trade: Trade): ChatCompletionContentPart[] {
  const parts: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Business trade: ${trade}\nScore each of the following ${batch.length} image(s) on I1-I6, and report coverage gaps and red flags for this set.`,
    },
  ];
  for (const [i, img] of batch.entries()) {
    parts.push({
      type: "text",
      text: `Image ${i + 1}: asset_ref="${img.asset_id}"${img.alt ? `, alt="${img.alt}"` : ""}`,
    });
    parts.push({ type: "image_url", image_url: { url: img.data_url } });
  }
  return parts;
}

/** A category is truly missing from the whole image set only if every batch
 *  independently reported it missing from the slice it saw — union would
 *  wrongly flag a gap that a *different* batch's images actually covered. */
function mergeVisualDirectorBatches(results: VisualDirectorOutput[]): VisualDirectorOutput {
  if (results.length === 1) return results[0];
  return {
    images: results.flatMap((r) => r.images),
    red_flags: results.flatMap((r) => r.red_flags),
    coverage_gaps: ALL_COVERAGE_GAPS.filter((gap) => results.every((r) => r.coverage_gaps.includes(gap))),
  };
}

/** GPT-4o vision batches over the normalized image set (plan §5.5 Stage 2).
 *  Zero images → deterministic empty output with every coverage gap flagged,
 *  no model call. More than 8 images → split into ≤8-image batches run in
 *  parallel and merged. */
export async function runVisualDirector(input: RunVisualDirectorInput): Promise<VisualDirectorOutput> {
  if (input.images.length === 0) {
    return { images: [], coverage_gaps: [...ALL_COVERAGE_GAPS], red_flags: [] };
  }

  const batches = chunk(input.images, VISUAL_DIRECTOR_BATCH_SIZE);
  const results = await Promise.all(
    batches.map((batch) =>
      structuredCall({
        schema: VisualDirectorOutput,
        schemaName: "visual_director_output",
        system: VISUAL_DIRECTOR_SYSTEM,
        user: buildVisualDirectorUserContent(batch, input.trade),
        model: getModels().vision,
        stage: "visual_director",
      }),
    ),
  );

  return mergeVisualDirectorBatches(results);
}

// ---------------------------------------------------------------------------
// Synthesizer (F-034)
// ---------------------------------------------------------------------------

/** Everything the Synthesizer needs for context, reusing the frozen Report
 *  shape minus the two fields it is responsible for producing. This is "the
 *  numeric report + channels (from rubric)" per the task brief — Report
 *  already bundles both under one frozen type. */
export type SynthesizerReportInput = Omit<Report, "executive_summary" | "memory_note">;

export interface MemoryHits {
  count: number;
  weakest_lane: string;
}

export interface RunSynthesizerInput {
  report: SynthesizerReportInput;
  memoryHits: MemoryHits | null;
}

function buildSynthesizerUserContent(report: SynthesizerReportInput): string {
  const channelLines = report.channels
    .map((c) => `- ${c.id} [${c.lane}, severity=${c.severity}, status=${c.status}]: ${c.title}`)
    .join("\n");
  const findingLines = report.findings
    .map((f) => `- (${f.lane}/${f.severity}) ${f.criterion}: "${f.evidence_quote}"`)
    .join("\n");

  return [
    `Overall score: ${report.overall_score}/100 (${report.band})`,
    `Text score: ${report.text.score}/100. Image score: ${report.images.score}/100.`,
    `Findability: ${report.findability.status}.`,
    "",
    "Channels (ordered by priority, write one verdict line per channel that has one):",
    channelLines || "(none)",
    "",
    "Findings backing those channels:",
    findingLines || "(none)",
  ].join("\n");
}

/** Exact template required by the memory contract (plan §5.7) — built here,
 *  deterministically, from real Cognee hit data. This keeps the model out of
 *  the loop entirely for this one line: SYNTHESIZER_SYSTEM instructs it to
 *  always emit memory_note: null, and this function is the only place that
 *  ever sets a non-null memory_note on the final output, so it can never
 *  drift from the required wording or fabricate a count. */
function buildMemoryNote(memoryHits: MemoryHits | null): { text: string; similar_count: number } | null {
  if (!memoryHits || memoryHits.count < 1) return null;
  return {
    text: `Compared to ${memoryHits.count} similar businesses we audited, the weakest shared area is ${memoryHits.weakest_lane}`,
    similar_count: memoryHits.count,
  };
}

/** One structured call after the rubric engine: executive summary + one-line
 *  channel verdicts. Cannot change any number or ranking — the output schema
 *  has no numeric report fields at all, only prose, and memory_note is
 *  always overwritten deterministically from memoryHits after the call. */
export async function runSynthesizer(input: RunSynthesizerInput): Promise<SynthesizerOutput> {
  const modelResult = await structuredCall({
    schema: SynthesizerOutput,
    schemaName: "synthesizer_output",
    system: SYNTHESIZER_SYSTEM,
    user: buildSynthesizerUserContent(input.report),
    stage: "synthesizer",
  });

  return {
    ...modelResult,
    memory_note: buildMemoryNote(input.memoryHits),
  };
}

// ---------------------------------------------------------------------------
// GBP screenshot extraction (consumed by F-025, owned by the pipeline agent)
// ---------------------------------------------------------------------------

export interface RunGbpExtractionInput {
  screenshots: string[]; // data URLs
}

const EMPTY_GBP_EXTRACTION: GbpExtractionOutput = {
  review_count: null,
  rating: null,
  has_photo_reviews: null,
  description: null,
};

/** Vision extraction of review count/rating/photo-reviews/description from
 *  one or more GBP screenshots. Zero screenshots → deterministic empty
 *  output, no model call (symmetric with the other zero-evidence paths;
 *  precedence against manual/link data is resolved by the caller, not here). */
export async function runGbpExtraction(input: RunGbpExtractionInput): Promise<GbpExtractionOutput> {
  if (input.screenshots.length === 0) {
    return { ...EMPTY_GBP_EXTRACTION };
  }

  const parts: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Extract the Google Business Profile details visible across these ${input.screenshots.length} screenshot(s). Set any field you cannot read with certainty to null.`,
    },
  ];
  for (const [i, url] of input.screenshots.entries()) {
    parts.push({ type: "text", text: `Screenshot ${i + 1}:` });
    parts.push({ type: "image_url", image_url: { url } });
  }

  return structuredCall({
    schema: GbpExtractionOutput,
    schemaName: "gbp_extraction_output",
    system: GBP_EXTRACTION_SYSTEM,
    user: parts,
    model: getModels().vision,
    stage: "gbp_extraction",
  });
}

// ---------------------------------------------------------------------------
// FEA-114 · Image content classifier
// ---------------------------------------------------------------------------

export interface RunImageClassifierInput {
  images: VisualDirectorImage[];
  trade: Trade;
}

/** Classifies each image into the FEA-114 shot-list taxonomy (what does this
 *  picture SHOW?), so composition can apply per-category quotas and generation
 *  can fill only the gaps. Reuses the Visual Director's batching and its
 *  already-prepared data URLs — same images, same call shape, one extra
 *  structured vision call per batch.
 *
 *  Never throws for "the model was unsure": an unclassifiable image is the
 *  model's own `other`. A genuinely failed CALL is the caller's problem to
 *  handle honestly (lib/pipeline/orchestrator.ts falls back to the pure
 *  heuristic classifier and labels the source accordingly). */
export async function runImageClassifier(input: RunImageClassifierInput): Promise<ImageClassifierOutput> {
  if (input.images.length === 0) return { images: [] };

  const batches = chunk(input.images, VISUAL_DIRECTOR_BATCH_SIZE);
  const results = await Promise.all(
    batches.map((batch) =>
      structuredCall({
        schema: ImageClassifierOutput,
        schemaName: "image_classifier_output",
        system: IMAGE_CLASSIFIER_SYSTEM,
        user: buildImageClassifierUserContent(batch, input.trade),
        model: getModels().vision,
        stage: "image_classifier",
      }),
    ),
  );
  return { images: results.flatMap((r) => r.images) };
}

function buildImageClassifierUserContent(batch: VisualDirectorImage[], trade: Trade): ChatCompletionContentPart[] {
  const parts: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Business trade: ${trade}\nClassify each of the following ${batch.length} image(s). Echo each asset_ref exactly as given.`,
    },
  ];
  for (const [i, img] of batch.entries()) {
    parts.push({ type: "text", text: `Image ${i + 1}: asset_ref="${img.asset_id}"${img.alt ? `, alt="${img.alt}"` : ""}` });
    parts.push({ type: "image_url", image_url: { url: img.data_url } });
  }
  return parts;
}
