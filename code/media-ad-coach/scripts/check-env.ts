// F-004: startup smoke test for the two P0 partner keys. Verifies presence,
// then makes a minimal *live* call against each provider so a bad/expired
// key fails loudly before a demo run rather than mid-pipeline.
//
// Note: the plan calls for `loadEnvConfig` from '@next/env', but that package
// is a transitive dependency of `next` and is not hoisted under this repo's
// strict pnpm layout (bare `import "@next/env"` does not resolve outside of
// Next's own build/dev process). Since this script must not touch
// package.json/lockfile, it loads `.env` itself with the same semantics
// (KEY=VALUE lines, existing process.env values win).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv(cwd: string): void {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf-8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function maskKey(key: string): string {
  const prefix = key.slice(0, 6);
  return `${prefix}${"*".repeat(Math.max(0, key.length - prefix.length))}`;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function checkOpenAI(apiKey: string): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const page = await withTimeout(client.models.list(), 8000, "OpenAI models.list");
  return `models.list() returned ${page.data.length} model(s) on the first page`;
}

async function checkTavily(apiKey: string): Promise<string> {
  const { tavily } = await import("@tavily/core");
  const client = tavily({ apiKey });
  const response = await withTimeout(client.search("test", { maxResults: 1 }), 8000, "Tavily search");
  return `search("test") returned ${response.results.length} result(s)`;
}

// ISS-022: the PDF export (lib/export/report-pdf.ts) and website screenshots
// (lib/pipeline/screenshot.ts) launch Playwright Chromium. A `playwright` version bump
// without `playwright install` leaves the cache holding an older build, and the launch
// failure surfaces only as a generic 503 / silent `browser_unavailable`. Assert the
// executable actually exists on disk before a demo run.
async function checkPlaywrightBrowser(): Promise<string> {
  const { chromium } = await import("playwright");
  const executable = chromium.executablePath();
  if (!executable || !existsSync(executable)) {
    throw new Error(
      `Chromium build not installed at ${executable || "<unknown path>"} — run \`pnpm exec playwright install chromium\``,
    );
  }
  // The PDF/screenshot paths launch headless, which uses the separate
  // `chromium_headless_shell-<rev>` build; only a real launch proves both are present.
  try {
    const browser = await withTimeout(chromium.launch({ headless: true }), 20000, "chromium.launch");
    await browser.close();
  } catch (err) {
    throw new Error(
      `${describeError(err).split("\n")[0]} — run \`pnpm exec playwright install chromium\``,
    );
  }
  return `headless launch succeeded (${executable})`;
}

async function main(): Promise<void> {
  loadDotEnv(process.cwd());

  const openaiKey = process.env.OPENAI_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;

  // Local-tooling check first: it needs no keys, and a missing browser breaks the PDF
  // export and screenshots regardless of provider credentials.
  let browserOk = true;
  try {
    console.log(`check-env: Playwright OK — ${await checkPlaywrightBrowser()}`);
  } catch (err) {
    browserOk = false;
    console.error(`check-env: Playwright FAILED — ${describeError(err)}`);
  }

  const missing: string[] = [];
  if (!openaiKey || openaiKey.trim().length === 0) missing.push("OPENAI_API_KEY");
  if (!tavilyKey || tavilyKey.trim().length === 0) missing.push("TAVILY_API_KEY");

  if (missing.length > 0) {
    console.error("check-env: missing required environment variable(s):");
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    console.error("\nSet these in a local .env file (see .env.example) and re-run `pnpm check-env`.");
    process.exit(1);
    return;
  }

  console.log("check-env: keys found, running live smoke calls (OpenAI + Tavily, ~8s timeout each)...");

  const [openaiResult, tavilyResult] = await Promise.allSettled([
    checkOpenAI(openaiKey!),
    checkTavily(tavilyKey!),
  ]);

  let ok = browserOk;

  if (openaiResult.status === "fulfilled") {
    console.log(`check-env: OpenAI OK — ${openaiResult.value}`);
  } else {
    ok = false;
    console.error(`check-env: OpenAI FAILED — ${describeError(openaiResult.reason)}`);
  }

  if (tavilyResult.status === "fulfilled") {
    console.log(`check-env: Tavily OK — ${tavilyResult.value}`);
  } else {
    ok = false;
    console.error(`check-env: Tavily FAILED — ${describeError(tavilyResult.reason)}`);
  }

  if (!ok) {
    process.exit(1);
    return;
  }

  console.log(
    `check-env: all partner keys verified live. OPENAI_API_KEY=${maskKey(openaiKey!)} TAVILY_API_KEY=${maskKey(tavilyKey!)}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`check-env: unexpected failure — ${describeError(err)}`);
  process.exit(1);
});
