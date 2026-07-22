/**
 * F-030 — OpenAI structured-call helper (plan §5.5, feature-breakdown F-030).
 *
 * Lazy client, model names from env, and one generic `structuredCall` used by
 * every expert/rewrite agent in lib/agents/experts.ts. Structured Outputs
 * (strict JSON schema mode) is built straight from the frozen zod v4 schemas
 * in lib/schemas.ts via `zodResponseFormat` from `openai/helpers/zod` — that
 * helper detects zod v4 objects (`'_zod' in schema`) and converts them with
 * zod's own `z.toJSONSchema` under the hood, so no manual JSON-schema
 * construction is needed here (verified directly against this repo's
 * zod@4.4.3 + openai@6.48.0 pin — see tests/agents.test.ts).
 *
 * Errors are never swallowed: a failure surfaces as a typed `AgentCallError`
 * so the caller (orchestrator) decides what it means for the audit.
 */
import OpenAI, { APIError } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ZodError, type ZodType } from "zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";

// ---------------------------------------------------------------------------
// Models (plan §5.5 / .env.example)
// ---------------------------------------------------------------------------

export interface AgentModels {
  text: string;
  vision: string;
  image: string;
}

/** Reads model names from env on every call (not cached) so tests can flip
 *  env vars between cases without re-importing the module. */
export function getModels(): AgentModels {
  return {
    text: process.env.OPENAI_MODEL_TEXT || "gpt-5.6-luna",
    vision: process.env.OPENAI_MODEL_VISION || "gpt-5.6-luna",
    // Human decision 2026-07-21 (supersedes ISS-027's model swap): gpt-image-2
    // is the image model, chosen for quality. Its latency is variable — the
    // same 1536x1024/medium hero call measured 38.5s once and >500s another
    // time — and that is handled by FEA-112's asynchronous, streamed flow (the
    // report completes without waiting; partial frames land in ~13s), never by
    // switching to a faster model.
    image: process.env.OPENAI_MODEL_IMAGE || "gpt-image-2",
  };
}

// ---------------------------------------------------------------------------
// Typed error — never swallowed
// ---------------------------------------------------------------------------

export class AgentCallError extends Error {
  readonly provider = "openai" as const;
  readonly stage: string;
  readonly cause: unknown;

  constructor(opts: { stage: string; cause: unknown; message?: string }) {
    super(opts.message ?? `OpenAI agent call failed at stage "${opts.stage}": ${describeCause(opts.cause)}`);
    this.name = "AgentCallError";
    this.stage = opts.stage;
    this.cause = opts.cause;
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

// ---------------------------------------------------------------------------
// Client — lazy singleton; directly injectable per call for tests
// ---------------------------------------------------------------------------

let cachedClient: OpenAI | null = null;

/** No API key → immediate, clear `AgentCallError` (no retry: this is a
 *  configuration problem, not a transient one). */
export function getOpenAIClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AgentCallError({
      stage: "client_init",
      cause: new Error("OPENAI_API_KEY is not set"),
      message: "OpenAI client requested but OPENAI_API_KEY is not set.",
    });
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

/** Test-only seam: clears the cached singleton so a later getOpenAIClient()
 *  re-reads env. Production code never needs this — structuredCall accepts
 *  its own `client` override per call instead. */
export function __resetOpenAIClientForTests(): void {
  cachedClient = null;
}

// ---------------------------------------------------------------------------
// structuredCall — one generic call used by every agent in experts.ts
// ---------------------------------------------------------------------------

export type AgentUserContent = string | ChatCompletionContentPart[];

export interface StructuredCallOptions<T> {
  schema: ZodType<T>;
  schemaName: string;
  system: string;
  user: AgentUserContent;
  model?: string;
  maxTokens?: number;
  /** Error-reporting label; defaults to schemaName. Lets several call sites
   *  share one schema (e.g. per-channel rewrites) with distinct stages. */
  stage?: string;
  /** Injectable client — tests pass a fake here so no OPENAI_API_KEY or
   *  network access is ever needed to exercise the retry logic. */
  client?: OpenAI;
}

/** Runs one Structured Outputs chat completion, retrying exactly once on a
 *  parse failure, validation failure, rate limit (429), or 5xx. Any other
 *  failure, or a second failure after the retry, surfaces as `AgentCallError`. */
export async function structuredCall<T>(opts: StructuredCallOptions<T>): Promise<T> {
  const stage = opts.stage ?? opts.schemaName;

  let client: OpenAI;
  try {
    client = opts.client ?? getOpenAIClient();
  } catch (error) {
    throw error instanceof AgentCallError ? error : new AgentCallError({ stage, cause: error });
  }

  const model = opts.model ?? getModels().text;
  const responseFormat = zodResponseFormat(opts.schema, opts.schemaName);

  const attempt = async (): Promise<T> => {
    const completion = await client.chat.completions.create({
      model,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: responseFormat,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`OpenAI returned no message content for schema "${opts.schemaName}"`);
    }

    // JSON.parse throws SyntaxError on malformed content; schema.parse
    // throws ZodError on a shape that doesn't match — both are caught by
    // isRetryable() below and drive the single retry.
    const parsed: unknown = JSON.parse(content);
    return opts.schema.parse(parsed);
  };

  try {
    return await attempt();
  } catch (firstError) {
    if (!isRetryable(firstError)) {
      throw new AgentCallError({ stage, cause: firstError });
    }
    try {
      return await attempt();
    } catch (secondError) {
      throw new AgentCallError({ stage, cause: secondError });
    }
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ZodError) return true; // validation failure
  if (error instanceof SyntaxError) return true; // parse failure
  if (error instanceof APIError) {
    if (error.status === 429) return true; // rate limit
    if (typeof error.status === "number" && error.status >= 500) return true; // 5xx
  }
  return false;
}
