import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureWebsiteScreenshot, type ScreenshotDependencies } from "../lib/pipeline/screenshot";

let root: string;
const originalStorage = process.env.APP_STORAGE_DIR;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "media-ad-screenshot-"));
  process.env.APP_STORAGE_DIR = root;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (originalStorage === undefined) delete process.env.APP_STORAGE_DIR;
  else process.env.APP_STORAGE_DIR = originalStorage;
});

function fakeRuntime(options: { hang?: boolean; requestUrl?: string } = {}) {
  const abort = vi.fn(async () => undefined);
  const proceed = vi.fn(async () => undefined);
  const closeContext = vi.fn(async () => undefined);
  const closeBrowser = vi.fn(async () => undefined);
  const runtime = {
    chromium: {
      launch: vi.fn(async () => ({
        newContext: vi.fn(async () => ({
          route: vi.fn(async (_pattern: string, handler: (route: unknown) => Promise<void>) => {
            await handler({ request: () => ({ url: () => options.requestUrl ?? "https://93.184.216.34/app.css" }), continue: proceed, abort });
          }),
          newPage: vi.fn(async () => ({
            goto: vi.fn(() => options.hang ? new Promise(() => undefined) : Promise.resolve()),
            screenshot: vi.fn(async () => Buffer.from("real-png")),
          })),
          close: closeContext,
        })),
        close: closeBrowser,
      })),
    },
  };
  return { runtime, abort, proceed, closeContext, closeBrowser };
}

describe("captureWebsiteScreenshot", () => {
  it("rejects localhost before launching a browser", async () => {
    const fake = fakeRuntime();
    const result = await captureWebsiteScreenshot(
      { auditId: "a1", url: "http://localhost:3000/admin" },
      { loadRuntime: async () => fake.runtime } as ScreenshotDependencies,
    );
    expect(result).toMatchObject({ ok: false, reason: "unsafe_url", execution_mode: "HANDOFF_REQUIRED" });
    expect(fake.runtime.chromium.launch).not.toHaveBeenCalled();
  });

  it("truthfully degrades when Playwright is unavailable", async () => {
    const result = await captureWebsiteScreenshot(
      { auditId: "a1", url: "https://93.184.216.34" },
      { loadRuntime: async () => { throw new Error("missing"); } },
    );
    expect(result).toMatchObject({ ok: false, reason: "playwright_unavailable", execution_mode: "HANDOFF_REQUIRED" });
  });

  it("captures and persists a real browser screenshot", async () => {
    const fake = fakeRuntime();
    const result = await captureWebsiteScreenshot(
      { auditId: "a1", url: "https://93.184.216.34" },
      { loadRuntime: async () => fake.runtime },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected capture success");
    expect(result).toMatchObject({ width: 1440, height: 900 });
    expect(result.storage_path).toBe(join("screenshots", "a1", "before.png"));
    const storedFile = join(root, result.storage_path);
    expect(existsSync(storedFile)).toBe(true);
    expect(readFileSync(storedFile).toString()).toBe("real-png");
    expect(fake.proceed).toHaveBeenCalled();
  });

  it("blocks a private redirect/subresource at the browser routing boundary", async () => {
    const fake = fakeRuntime({ requestUrl: "http://169.254.169.254/latest/meta-data" });
    await captureWebsiteScreenshot(
      { auditId: "a1", url: "https://93.184.216.34" },
      { loadRuntime: async () => fake.runtime },
    );
    expect(fake.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(fake.proceed).not.toHaveBeenCalled();
  });

  it("returns a truthful handoff result on an explicit timeout and closes resources", async () => {
    const fake = fakeRuntime({ hang: true });
    const result = await captureWebsiteScreenshot(
      { auditId: "a1", url: "https://93.184.216.34", timeoutMs: 5 },
      { loadRuntime: async () => fake.runtime },
    );
    expect(result).toMatchObject({ ok: false, reason: "timeout", execution_mode: "HANDOFF_REQUIRED" });
    expect(fake.closeContext).toHaveBeenCalled();
    expect(fake.closeBrowser).toHaveBeenCalled();
  });
});
