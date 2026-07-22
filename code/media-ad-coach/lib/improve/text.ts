/**
 * F-050 — Text channel rewrites ("Do It For You" engine, plan §4.2).
 *
 * One structured call per text channel, using the INDIVIDUAL per-channel zod
 * schema as the Structured Outputs root (never `RewriteOutput`, the
 * discriminated union — see docs/CONTRACTS.md's zodResponseFormat rule).
 * `improveTextChannels` runs up to 5 of these in parallel with a small
 * worker-pool so a slow/failed call never blocks the others.
 */
import type OpenAI from "openai";
import type { ZodType } from "zod";
import { structuredCall } from "../agents/openai";
import { REWRITER_SYSTEM } from "../agents/prompts";
import {
  BusinessDescriptionRewrite,
  CtaContactRewrite,
  HeroHeadlineRewrite,
  LegalFooterRewrite,
  PlatformConsistencyRewrite,
  ServicesCopyRewrite,
  type RewriteOutput,
  type TextChannelId,
  type Trade,
} from "../schemas";

// ---------------------------------------------------------------------------
// Per-channel schema lookup (structuredCall root must be a single plain
// object schema, never the RewriteOutput union — docs/CONTRACTS.md).
// ---------------------------------------------------------------------------

interface ChannelSchemaEntry {
  schema: ZodType<RewriteOutput>;
  schemaName: string;
}

const SCHEMA_BY_TEXT_CHANNEL: Record<TextChannelId, ChannelSchemaEntry> = {
  hero_headline: { schema: HeroHeadlineRewrite as ZodType<RewriteOutput>, schemaName: "hero_headline_rewrite" },
  business_description: {
    schema: BusinessDescriptionRewrite as ZodType<RewriteOutput>,
    schemaName: "business_description_rewrite",
  },
  services_copy: { schema: ServicesCopyRewrite as ZodType<RewriteOutput>, schemaName: "services_copy_rewrite" },
  cta_contact: { schema: CtaContactRewrite as ZodType<RewriteOutput>, schemaName: "cta_contact_rewrite" },
  legal_footer: { schema: LegalFooterRewrite as ZodType<RewriteOutput>, schemaName: "legal_footer_rewrite" },
  platform_consistency: {
    schema: PlatformConsistencyRewrite as ZodType<RewriteOutput>,
    schemaName: "platform_consistency_rewrite",
  },
};

// ---------------------------------------------------------------------------
// improveTextChannel — one channel, one structured call
// ---------------------------------------------------------------------------

export interface ImproveTextChannelInput {
  auditId: string;
  channelId: TextChannelId;
  /** The channel's persisted row content this rewrite is grounded in.
   *  `before_json` carries the rubric engine's excerpts/notes (F-015,
   *  lib/rubric.ts `buildBeforeForChannel`) — this IS "the finding evidence"
   *  for a text channel; `findings_json` carries the linked finding ids for
   *  traceability only. */
  channelRow: { findings_json: unknown; before_json: unknown };
  business: { trade: Trade; city?: string | null; brand_name: string };
  originalText: string;
  /** Injectable client — tests pass a fake here (see lib/agents/openai.ts). */
  client?: OpenAI;
}

function describeBeforeEvidence(before: unknown): string {
  if (!before || typeof before !== "object") return "(no specific evidence captured for this channel)";
  const record = before as Record<string, unknown>;
  const excerpts = Array.isArray(record.excerpts) ? (record.excerpts as unknown[]) : null;
  if (excerpts && excerpts.length > 0) {
    return excerpts.map((e) => `- ${String(e)}`).join("\n");
  }
  // Image-channel-shaped before payloads (asset_refs/notes) or any other
  // shape: fall back to the raw JSON rather than silently dropping evidence.
  return `- ${JSON.stringify(record)}`;
}

function describeFindingIds(findingsJson: unknown): string {
  if (!Array.isArray(findingsJson) || findingsJson.length === 0) return "none";
  return findingsJson.map((id) => String(id)).join(", ");
}

function buildTextRewriteUserContent(input: ImproveTextChannelInput): string {
  const cityLine = input.business.city ? `, ${input.business.city}` : "";
  return [
    `Business: ${input.business.brand_name} (${input.business.trade}${cityLine})`,
    `Findings driving this rewrite (ids: ${describeFindingIds(input.channelRow.findings_json)}):`,
    describeBeforeEvidence(input.channelRow.before_json),
    "",
    "Original text for this channel (may be empty if nothing existed before):",
    input.originalText.trim().length > 0 ? input.originalText : "(none — this content did not exist before)",
    "",
    "Tone rules: plain words, no marketing jargon, local, trustworthy — write like a good craftsman talks.",
  ].join("\n");
}

/** One structured call scoped to a single text channel's rewrite schema
 *  (F-050). REWRITER_SYSTEM already carries the honesty/tone rules and the
 *  doctor compliance instruction; the user message adds the concrete
 *  evidence + original text this specific business needs rewritten. */
export async function improveTextChannel(input: ImproveTextChannelInput): Promise<RewriteOutput> {
  const { schema, schemaName } = SCHEMA_BY_TEXT_CHANNEL[input.channelId];
  return structuredCall({
    schema,
    schemaName,
    system: REWRITER_SYSTEM(input.channelId, input.business.trade, input.business.city ?? null),
    user: buildTextRewriteUserContent(input),
    stage: `rewrite_${input.channelId}`,
    client: input.client,
  });
}

// ---------------------------------------------------------------------------
// improveTextChannels — parallel pool, concurrency <= 5 (F-050)
// ---------------------------------------------------------------------------

export type ImproveTextChannelOutcome =
  | { input: ImproveTextChannelInput; status: "success"; result: RewriteOutput }
  | { input: ImproveTextChannelInput; status: "error"; error: unknown };

/** Runs `improveTextChannel` over every input with at most `concurrency`
 *  calls in flight at once (a small manual worker pool — no extra
 *  dependency). Every input always produces exactly one outcome, success or
 *  error; a single channel's failure never throws out of this function or
 *  blocks the others (F-045 failure honesty is applied by the caller, which
 *  decides what "error" means for that channel's DB row). */
export async function improveTextChannels(
  inputs: ImproveTextChannelInput[],
  concurrency = 5,
): Promise<ImproveTextChannelOutcome[]> {
  const outcomes: ImproveTextChannelOutcome[] = new Array(inputs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= inputs.length) return;
      const input = inputs[i]!;
      try {
        const result = await improveTextChannel(input);
        outcomes[i] = { input, status: "success", result };
      } catch (error) {
        outcomes[i] = { input, status: "error", error };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, inputs.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return outcomes;
}
