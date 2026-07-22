import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 15_000;

interface RouteLike {
  request(): { url(): string };
  continue(): Promise<unknown>;
  abort(errorCode?: string): Promise<unknown>;
}

interface BrowserRuntime {
  chromium: {
    launch(options: { headless: boolean }): Promise<{
      newContext(options: { viewport: { width: number; height: number }; ignoreHTTPSErrors: boolean }): Promise<{
        route(pattern: string, handler: (route: RouteLike) => Promise<void>): Promise<void>;
        newPage(): Promise<{
          goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
          screenshot(options: { type: "png"; fullPage: boolean; timeout: number }): Promise<Buffer>;
          content?(): Promise<string>;
        }>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
}

export interface CaptureWebsiteScreenshotInput {
  auditId: string;
  url: string;
  timeoutMs?: number;
}

export type CaptureWebsiteScreenshotResult =
  | {
      ok: true;
      execution_mode: "LIVE";
      storage_path: string;
      width: 1440;
      height: 900;
      /** ISS-012: the browser-rendered DOM (`page.content()`), so JS-only
       *  sites still yield real text/image evidence when the server-side
       *  fetch ladder sees only an empty shell. TRANSIENT — the orchestrator
       *  consumes it for evidence extraction and strips it before persisting
       *  `before_screenshot` into evidence_json. */
      rendered_html?: string;
    }
  | {
      ok: false;
      execution_mode: "HANDOFF_REQUIRED";
      reason: "unsafe_url" | "playwright_unavailable" | "browser_unavailable" | "timeout" | "capture_failed";
      detail: string;
    };

export interface ScreenshotDependencies {
  loadRuntime?: () => Promise<BrowserRuntime>;
  resolveHost?: (hostname: string) => Promise<Array<{ address: string }>>;
}

function storageRoot(): string {
  return process.env.APP_STORAGE_DIR?.trim() || join(process.cwd(), "storage");
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;

  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (normalized === "::" || normalized === "::1") return false;
  if (/^(fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized) || /^ff/.test(normalized)) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  return true;
}

async function assertSafeHttpUrl(
  rawUrl: string,
  resolveHost: NonNullable<ScreenshotDependencies["resolveHost"]>,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("The website URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) website URLs are allowed.");
  if (url.username || url.password) throw new Error("Website URLs containing credentials are not allowed.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local network website URLs are not allowed.");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("The website URL resolves to a private or reserved network address.");
  }
  return url;
}

async function loadPlaywright(): Promise<BrowserRuntime> {
  // Resolve the direct dependency lazily so a deployment missing its browser
  // bundle degrades truthfully instead of failing the entire audit at import.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  return (await dynamicImport("playwright")) as BrowserRuntime;
}

function timed<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Screenshot capture timed out.")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function captureWebsiteScreenshot(
  input: CaptureWebsiteScreenshotInput,
  dependencies: ScreenshotDependencies = {},
): Promise<CaptureWebsiteScreenshotResult> {
  const resolveHost = dependencies.resolveHost ?? (async (hostname) => lookup(hostname, { all: true, verbatim: true }));
  let safeUrl: URL;
  try {
    safeUrl = await assertSafeHttpUrl(input.url, resolveHost);
  } catch (error) {
    return { ok: false, execution_mode: "HANDOFF_REQUIRED", reason: "unsafe_url", detail: error instanceof Error ? error.message : "Unsafe website URL." };
  }

  let runtime: BrowserRuntime;
  try {
    runtime = await (dependencies.loadRuntime ?? loadPlaywright)();
  } catch {
    return { ok: false, execution_mode: "HANDOFF_REQUIRED", reason: "playwright_unavailable", detail: "Playwright is unavailable; provide a website screenshot manually." };
  }

  const timeoutMs = Math.max(1, Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30_000));
  let browser: Awaited<ReturnType<BrowserRuntime["chromium"]["launch"]>> | undefined;
  let context: Awaited<ReturnType<Awaited<ReturnType<BrowserRuntime["chromium"]["launch"]>>["newContext"]>> | undefined;
  try {
    browser = await timed(runtime.chromium.launch({ headless: true }), timeoutMs);
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: false });
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (/^(data:|blob:|about:)/i.test(requestUrl)) return void (await route.continue());
      try {
        await assertSafeHttpUrl(requestUrl, resolveHost);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    const { image, renderedHtml } = await timed((async () => {
      await page.goto(safeUrl.toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const shot = await page.screenshot({ type: "png", fullPage: false, timeout: timeoutMs });
      // ISS-012: a content() failure must never sink a good screenshot —
      // the rendered DOM is a bonus evidence source, not a requirement.
      const html = await Promise.resolve(page.content?.()).catch(() => undefined);
      return { image: shot, renderedHtml: typeof html === "string" ? html : undefined };
    })(), timeoutMs);
    const relativePath = join("screenshots", input.auditId, "before.png");
    const dir = join(storageRoot(), "screenshots", input.auditId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(storageRoot(), relativePath), image);
    return {
      ok: true,
      execution_mode: "LIVE",
      storage_path: relativePath,
      width: 1440,
      height: 900,
      ...(renderedHtml ? { rendered_html: renderedHtml } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out|timeout/i.test(message)) return { ok: false, execution_mode: "HANDOFF_REQUIRED", reason: "timeout", detail: "Website screenshot capture timed out; provide a screenshot manually." };
    const reason = browser ? "capture_failed" : "browser_unavailable";
    return { ok: false, execution_mode: "HANDOFF_REQUIRED", reason, detail: `Website screenshot capture failed: ${message}` };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
