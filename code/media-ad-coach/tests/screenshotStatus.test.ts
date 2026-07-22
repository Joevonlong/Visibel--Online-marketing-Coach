// ISS-023 regression guard: a failed before_screenshot record must never leak
// its raw exception text (local paths, CLI banner, install instructions) into
// judge-visible UI copy, and no machine string may reach the UI unbounded.
import { describe, expect, it } from "vitest";

import {
  SCREENSHOT_UNAVAILABLE_TITLE,
  safeUiText,
  screenshotFailureCopy,
  screenshotFailureDiagnostics,
} from "../lib/client/screenshotStatus";

const RAW_PLAYWRIGHT_ERROR = [
  "Website screenshot capture failed: browserType.launch: Executable doesn't exist at",
  "/Users/someone/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-mac/headless_shell",
  "╔═════════════════════════════════════════════════════════════════════════╗",
  "║ Looks like Playwright was just installed or updated.                    ║",
  "║ Please run the following command to download new browsers:              ║",
  "║     npx playwright install                                              ║",
  "║                                       <3 Playwright Team                ║",
  "╚═════════════════════════════════════════════════════════════════════════╝",
].join("\n");

const failed = (reason: string) => ({ ok: false, execution_mode: "HANDOFF_REQUIRED", reason, detail: RAW_PLAYWRIGHT_ERROR });

describe("screenshotFailureCopy", () => {
  it("never echoes the raw exception text", () => {
    for (const reason of ["browser_unavailable", "capture_failed", "timeout", "playwright_unavailable", "unsafe_url", "weird_new_reason"]) {
      const copy = screenshotFailureCopy(failed(reason));
      expect(copy).not.toMatch(/playwright|Executable|\/Users\/|npx |║|browserType/i);
      expect(copy.length).toBeLessThanOrEqual(120);
      expect(copy.length).toBeGreaterThan(0);
    }
  });

  it("maps known reasons to distinct, user-meaningful copy", () => {
    expect(screenshotFailureCopy(failed("timeout"))).toMatch(/too long/i);
    expect(screenshotFailureCopy(failed("unsafe_url"))).toMatch(/safely/i);
    expect(screenshotFailureCopy(failed("browser_unavailable"))).toMatch(/not available/i);
  });

  it("falls back to generic copy for junk input", () => {
    expect(screenshotFailureCopy(null)).toMatch(/no live capture/i);
    expect(screenshotFailureCopy("boom")).toMatch(/no live capture/i);
    expect(screenshotFailureCopy({})).toMatch(/no live capture/i);
  });

  it("keeps the raw detail available for the server log only", () => {
    expect(screenshotFailureDiagnostics(failed("capture_failed"))).toBe(RAW_PLAYWRIGHT_ERROR);
    expect(screenshotFailureDiagnostics({ ok: false })).toBeNull();
    expect(screenshotFailureDiagnostics(null)).toBeNull();
  });

  it("exports a stable placeholder title", () => {
    expect(SCREENSHOT_UNAVAILABLE_TITLE).toBe("Screenshot unavailable");
  });
});

describe("safeUiText", () => {
  it("collapses CLI banners, newlines and control characters into one bounded line", () => {
    const out = safeUiText(RAW_PLAYWRIGHT_ERROR)!;
    expect(out).not.toMatch(/[\n\r║╔╚═]/);
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.endsWith("…")).toBe(true);
  });

  it("breaks nothing for normal copy", () => {
    expect(safeUiText("The live capture did not finish for this site.")).toBe(
      "The live capture did not finish for this site."
    );
  });

  it("returns null for non-strings and empty content", () => {
    expect(safeUiText(null)).toBeNull();
    expect(safeUiText(undefined)).toBeNull();
    expect(safeUiText(42)).toBeNull();
    expect(safeUiText("   \n\t ")).toBeNull();
  });

  it("has no single unbreakable token longer than the truncation bound", () => {
    const longPath = `/Users/x/${"a".repeat(400)}/headless_shell`;
    const out = safeUiText(longPath)!;
    expect(out.length).toBeLessThanOrEqual(180);
  });
});
