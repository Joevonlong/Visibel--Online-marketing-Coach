// FEA-113: `pnpm smoke:api` — a ~30s live smoke test of the three provider
// calls this product actually makes, so "is it the keys, the model, or my
// code?" is answered before a demo run instead of during one.
//
// Deliberately different from `pnpm check-env`: that one proves the KEYS are
// usable (`models.list`, a Tavily search, a Playwright launch). This one
// exercises the real call SHAPES — a structured text completion on
// OPENAI_MODEL_TEXT, an image generation on OPENAI_MODEL_IMAGE, and a Tavily
// search — and reports latency plus a normalized failure reason for each.
//
// Truth rules: the image check does NOT wait for a full render (gpt-image-2
// takes ~40s; see FEA-112's measurements). It waits for the first STREAMED
// frame and says so in its own output. Nothing here ever prints key material.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Same semantics as scripts/check-env.ts (existing process.env wins). Kept
 *  local rather than shared so this script has no import surface beyond the
 *  provider SDKs — it must run even when the app code does not compile. */
function loadDotEnv(cwd: string): void {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Normalized failure reasons — one word the reader can act on
// ---------------------------------------------------------------------------

type FailureReason =
  | "missing_key"
  | "invalid_key"
  | "no_model_access"
  | "rate_limited"
  | "timeout"
  | "network"
  | "provider_error"
  | "unknown";

/** Maps whatever the provider threw onto an actionable reason. Never includes
 *  the key, and never guesses beyond what the status/message actually says. */
function classify(error: unknown): { reason: FailureReason; detail: string } {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : String(error);
  // Providers like to echo the offending key back (already masked, but still
  // key-shaped). Nothing key-shaped leaves this script.
  const detail = raw.split("\n")[0]!.replace(/\b(sk|tvly)-[A-Za-z0-9_*-]+/g, "<redacted>").slice(0, 160);
  const text = raw.toLowerCase();

  if (text.includes("timed out") || text.includes("timeout")) return { reason: "timeout", detail };
  if (status === 401 || status === 403 || text.includes("incorrect api key") || text.includes("unauthorized")) {
    return { reason: "invalid_key", detail };
  }
  if (status === 404 || text.includes("does not exist") || text.includes("do not have access")) {
    return { reason: "no_model_access", detail };
  }
  if (status === 429 || text.includes("rate limit") || text.includes("quota")) return { reason: "rate_limited", detail };
  if (text.includes("econnrefused") || text.includes("enotfound") || text.includes("fetch failed") || text.includes("network")) {
    return { reason: "network", detail };
  }
  if (typeof status === "number" && status >= 500) return { reason: "provider_error", detail };
  if (typeof status === "number") return { reason: "provider_error", detail };
  return { reason: "unknown", detail };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
  note: string;
  reason?: FailureReason;
}

async function timed(name: string, run: () => Promise<string>): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const note = await run();
    return { name, ok: true, ms: Date.now() - startedAt, note };
  } catch (error) {
    const { reason, detail } = classify(error);
    return { name, ok: false, ms: Date.now() - startedAt, note: detail, reason };
  }
}

// ---------------------------------------------------------------------------
// The three checks
// ---------------------------------------------------------------------------

const TEXT_BUDGET_MS = 15_000;
const IMAGE_BUDGET_MS = 30_000;
const TAVILY_BUDGET_MS = 15_000;

async function checkOpenAIText(apiKey: string): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const model = process.env.OPENAI_MODEL_TEXT || "gpt-5.6-luna";
  const completion = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [{ role: "user", content: 'Reply with the single word: ready' }],
    }),
    TEXT_BUDGET_MS,
    "OpenAI text",
  );
  const content = completion.choices[0]?.message?.content?.trim() ?? "";
  if (content.length === 0) throw new Error(`model "${model}" returned empty content`);
  return `${model} → "${content.slice(0, 24)}"`;
}

/** Image models are slow by nature (FEA-112: gpt-image-2 ≈ 40s for a hero
 *  frame), so a 30s smoke check cannot honestly wait for a finished image.
 *  It waits for the first STREAMED frame — which proves the key, the model
 *  access, and that rendering has actually started — and labels the result as
 *  exactly that. If the provider rejects streaming, the request is still
 *  proven accepted or rejected, and the note says the render was not awaited. */
async function checkOpenAIImage(apiKey: string): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: IMAGE_BUDGET_MS });
  const model = process.env.OPENAI_MODEL_IMAGE || "gpt-image-2";
  const startedAt = Date.now();

  const stream = await withTimeout(
    client.images.generate({
      model,
      prompt: "A plain matte grey ceramic tile, centered, soft even studio light, no text.",
      size: "1024x1024",
      quality: "low",
      stream: true,
      partial_images: 1,
    }),
    IMAGE_BUDGET_MS,
    "OpenAI image (accept)",
  );

  const iterator = stream[Symbol.asyncIterator]();
  try {
    for (;;) {
      const remaining = IMAGE_BUDGET_MS - (Date.now() - startedAt);
      if (remaining <= 0) throw new Error(`OpenAI image timed out after ${IMAGE_BUDGET_MS}ms`);
      const next = await withTimeout(iterator.next(), remaining, "OpenAI image (first frame)");
      if (next.done) throw new Error(`model "${model}" streamed no image frame`);
      const event = next.value as { type?: string; b64_json?: string | null };
      if (typeof event.b64_json === "string" && event.b64_json.length > 0) {
        const kind = event.type?.endsWith("completed") ? "final frame" : "first partial frame";
        return `${model} 1024x1024/low → ${kind} received (full render NOT awaited)`;
      }
    }
  } finally {
    // Stop the render as soon as the smoke question is answered — this check
    // must not keep burning provider time after it has its answer.
    stream.controller?.abort();
  }
}

async function checkTavily(apiKey: string): Promise<string> {
  const { tavily } = await import("@tavily/core");
  const client = tavily({ apiKey });
  const response = await withTimeout(
    client.search("Sanitär Notdienst Berlin", { maxResults: 1 }),
    TAVILY_BUDGET_MS,
    "Tavily search",
  );
  return `search → ${response.results.length} result(s)`;
}

// ---------------------------------------------------------------------------

function line(result: CheckResult): string {
  const mark = result.ok ? "✓" : "✗";
  const seconds = `${(result.ms / 1000).toFixed(1)}s`.padStart(6);
  const name = result.name.padEnd(14);
  const reason = result.ok ? "" : `${result.reason}: `;
  return `  ${mark} ${name}${seconds}  ${reason}${result.note}`;
}

async function main(): Promise<void> {
  loadDotEnv(process.cwd());
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  console.log("smoke:api — live provider calls (no fixtures), ~30s budget\n");
  const startedAt = Date.now();

  const missing = (name: string): CheckResult => ({
    name,
    ok: false,
    ms: 0,
    note: `set it in .env (see .env.example)`,
    reason: "missing_key",
  });

  const results = await Promise.all([
    openaiKey ? timed("openai.text", () => checkOpenAIText(openaiKey)) : Promise.resolve(missing("openai.text")),
    openaiKey ? timed("openai.image", () => checkOpenAIImage(openaiKey)) : Promise.resolve(missing("openai.image")),
    tavilyKey ? timed("tavily.search", () => checkTavily(tavilyKey)) : Promise.resolve(missing("tavily.search")),
  ]);

  for (const result of results) console.log(line(result));

  const passed = results.filter((r) => r.ok).length;
  const elapsed = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  console.log(`\n${passed}/${results.length} checks passed in ${elapsed}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  const { reason, detail } = classify(error);
  console.error(`smoke:api — unexpected failure (${reason}): ${detail}`);
  process.exit(1);
});
