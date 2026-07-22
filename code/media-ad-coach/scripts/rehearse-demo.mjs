#!/usr/bin/env node

/**
 * Repeatable F-102/F-103 demo rehearsal and recording.
 *
 * This deliberately drives REPLAY, never LIVE: it needs no partner keys and
 * keeps the recorded fallback honest. Build first, then run:
 *
 *   pnpm build
 *   node scripts/rehearse-demo.mjs \
 *     --runs 3 \
 *     --record-run 3 \
 *     --video tmp/f103-demo-replay.webm \
 *     --results tmp/f102-rehearsal-results.json
 *
 * Every run starts a production server with an isolated temporary SQLite DB.
 * The final run rejects every browser request whose host is not localhost,
 * which is a repeatable network-loss proxy without disabling the operator's
 * machine network interface. The application itself runs with DEMO_MODE=replay.
 */

import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(SCRIPT_DIR, "..");

function parseArgs(argv) {
  const options = {
    runs: 3,
    recordRun: 3,
    firstPort: 3410,
    video: join(APP_DIR, "tmp", "f103-demo-replay.webm"),
    results: join(APP_DIR, "tmp", "f102-rehearsal-results.json"),
    headed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--runs") options.runs = Number(value), index += 1;
    else if (arg === "--record-run") options.recordRun = Number(value), index += 1;
    else if (arg === "--first-port") options.firstPort = Number(value), index += 1;
    else if (arg === "--video") options.video = isAbsolute(value) ? value : resolve(APP_DIR, value), index += 1;
    else if (arg === "--results") options.results = isAbsolute(value) ? value : resolve(APP_DIR, value), index += 1;
    else if (arg === "--headed") options.headed = true;
    else if (arg === "--help") {
      console.log("Usage: node scripts/rehearse-demo.mjs [--runs 3] [--record-run 3] [--video PATH] [--results PATH] [--headed]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(options.recordRun) || options.recordRun < 0 || options.recordRun > options.runs) {
    throw new Error("--record-run must be 0 (disabled) or a run number within --runs");
  }
  return options;
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function waitForServer(baseUrl, child, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let lastError = "not started";
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Next server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new Error(`Next server did not become ready: ${lastError}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    delay(4_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

function startServer(port, runDir, serverDir) {
  const nextBin = join(APP_DIR, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", serverDir, "-p", String(port)], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DEMO_MODE: "replay",
      OPENAI_API_KEY: "",
      TAVILY_API_KEY: "",
      COGNEE_API_KEY: "",
      APP_DB_PATH: join(runDir, "app.db"),
      APP_STORAGE_DIR: join(runDir, "storage"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  return { child, log };
}

async function installVideoCaptions(context) {
  await context.addInitScript(() => {
    function install() {
      if (document.getElementById("demo-truth-banner")) return;
      const style = document.createElement("style");
      style.textContent = `
        #demo-truth-banner { position: fixed; z-index: 2147483647; top: 12px; right: 12px;
          padding: 8px 12px; border-radius: 999px; background: #7c2d12; color: white;
          font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, sans-serif; letter-spacing: .04em;
          box-shadow: 0 4px 18px #0004; pointer-events: none; }
        #demo-caption { position: fixed; z-index: 2147483646; left: 22px; bottom: 22px;
          max-width: 610px; padding: 15px 18px; border-radius: 16px; color: white;
          background: rgba(0,0,0,.82); box-shadow: 0 8px 28px #0005;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif; pointer-events: none; }
        #demo-caption strong { display: block; font-size: 18px; line-height: 1.25; }
        #demo-caption span { display: block; margin-top: 5px; font-size: 14px; line-height: 1.35; color: #eee; }
      `;
      document.head.append(style);
      const truth = document.createElement("div");
      truth.id = "demo-truth-banner";
      truth.textContent = "REPLAY SAMPLE • OFFLINE-CAPABLE • NOT LIVE";
      document.body.append(truth);
      const caption = document.createElement("div");
      caption.id = "demo-caption";
      caption.style.display = "none";
      caption.innerHTML = "<strong></strong><span></span>";
      document.body.append(caption);
      window.__setDemoCaption = (title, body) => {
        caption.querySelector("strong").textContent = title;
        caption.querySelector("span").textContent = body;
        caption.style.display = "block";
      };
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  });
}

async function caption(page, recorded, title, body, durationMs = 2_500) {
  if (!recorded) return;
  await page.evaluate(({ titleText, bodyText }) => {
    window.__setDemoCaption?.(titleText, bodyText);
  }, { titleText: title, bodyText: body });
  await page.waitForTimeout(durationMs);
}

async function waitForAudit(page, predicate, timeoutMs = 20_000) {
  const idMatch = page.url().match(/\/audit\/([^/?]+)/);
  if (!idMatch) throw new Error(`No audit id in URL: ${page.url()}`);
  const auditId = idMatch[1];
  const deadline = Date.now() + timeoutMs;
  let lastData = null;
  while (Date.now() < deadline) {
    // Keep the asynchronous fetch outside waitForFunction: that API polls the
    // truthiness of the returned value, and a pending Promise is itself
    // truthy. Explicit Node-side polling prevents an early false-positive.
    lastData = await page.evaluate(async (id) => {
      const response = await fetch(`/api/audits/${id}?poll=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return { status: `HTTP_${response.status}` };
      return response.json();
    }, auditId);
    const ready = predicate === "scored"
      ? ["scored", "improving", "complete"].includes(lastData.status) && Boolean(lastData.report)
      : predicate === "hero_improved"
        ? ["scored", "complete"].includes(lastData.status)
          && lastData.channels?.some((channel) => channel.id === "hero_headline" && channel.status === "improved")
        : predicate === "preview"
          ? lastData.status === "complete" && lastData.preview_ready === true
          : false;
    if (ready) return auditId;
    await delay(200);
  }
  throw new Error(`Timed out waiting for audit ${predicate}: ${JSON.stringify(lastData)}`);
}

async function probeVideoDuration(browser, videoPath) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(videoPath).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video && Number.isFinite(video.duration) && video.duration > 0;
    }, null, { timeout: 10_000 });
    return await page.locator("video").evaluate((video) => video.duration);
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

async function runOne({ browser, runNumber, port, record, videoPath, serverDir }) {
  const runDir = await mkdtemp(join(tmpdir(), `visibel-rehearsal-${runNumber}-`));
  const { child, log } = startServer(port, runDir, serverDir);
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverStartedAt = Date.now();
  let context;
  let recordedPath = null;

  try {
    await waitForServer(baseUrl, child);
    const serverReadyMs = Date.now() - serverStartedAt;
    const videoDir = join(runDir, "video");
    const forceOffline = runNumber === 3;
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: record ? { dir: videoDir, size: { width: 1440, height: 900 } } : undefined,
    });
    await installVideoCaptions(context);

    let externalRequests = 0;
    let deniedExternalRequests = 0;
    if (forceOffline) {
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
          externalRequests += 1;
          deniedExternalRequests += 1;
          await route.abort("internetdisconnected");
        } else {
          await route.continue();
        }
      });
    }

    const page = await context.newPage();
    const video = record ? page.video() : null;
    const consoleErrors = [];
    const pageErrors = [];
    const failedLocalRequests = [];
    let expectedNavigationAborts = 0;
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const hostname = new URL(request.url()).hostname;
      if (["127.0.0.1", "localhost"].includes(hostname)) {
        const errorText = request.failure()?.errorText ?? "failed";
        // Next cancels RSC prefetches and the open event stream whenever the
        // walkthrough navigates. Chromium reports those expected cancellations
        // as ERR_ABORTED; real localhost failures remain stop-ship errors.
        if (errorText.includes("ERR_ABORTED")) expectedNavigationAborts += 1;
        else failedLocalRequests.push(`${request.method()} ${request.url()} — ${errorText}`);
      }
    });

    const flowStartedAt = Date.now();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "From Zero to Hero." }).waitFor();
    await caption(page, record, "From Zero to Hero", "Score the words and photos customers see, then fix the weak channels in one flow.", 3_000);

    // Abort-to-REPLAY drill: visit the normal input path, then deliberately
    // switch to the sample instead of pretending keys/network are available.
    await page.getByRole("link", { name: "Check my business" }).first().click();
    await page.waitForURL("**/audit/new");
    await caption(
      page,
      record,
      "One clear input",
      "Add the business details, public presence and any supporting photos; this recorded drill then switches to the sample.",
      3_000,
    );
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    await page.getByRole("link", { name: /See a sample report/i }).click();
    await page.waitForURL(/\/audit\/[^/]+$/);
    const scoreWaitStartedAt = Date.now();
    const auditId = await waitForAudit(page, "scored");
    const scoreReadyMs = Date.now() - scoreWaitStartedAt;
    const scoredAudit = await page.evaluate(async (id) => {
      const response = await fetch(`/api/audits/${id}?rehearsal-score=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`score fetch failed with HTTP ${response.status}`);
      return response.json();
    }, auditId);
    const expectedScore = scoredAudit.report?.overall_score;
    const expectedBand = scoredAudit.report?.band;
    if (!Number.isFinite(expectedScore) || typeof expectedBand !== "string") {
      throw new Error(`Replay report did not expose a score and band: ${JSON.stringify(scoredAudit.report)}`);
    }
    // The report keeps a progress/event stream open, so `networkidle` is not
    // a valid readiness signal here. The API assertion above is authoritative.
    await page.goto(`${baseUrl}/audit/${auditId}?rehearsal=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.getByText("REPLAY SAMPLE", { exact: true }).first().waitFor();
    await page.getByText(expectedBand, { exact: true }).waitFor();
    await page.locator(".tabular-nums").filter({ hasText: new RegExp(`${expectedScore}\\s*\\/100`) }).first().waitFor();
    await caption(
      page,
      record,
      `${expectedScore}/100 — ${expectedBand}`,
      "The mode badge is REPLAY SAMPLE. Every score remains tied to recorded quotes and photos.",
      3_500,
    );

    const worstQuotes = page.getByRole("heading", { name: "Worst quotes" });
    await worstQuotes.scrollIntoViewIfNeeded();
    await caption(page, record, "Evidence, not a black box", "The report exposes the recorded source quote and the weakest customer-visible photos.", 3_500);

    const heroHeading = page.getByRole("heading", { name: "Headline & first impression" });
    await heroHeading.scrollIntoViewIfNeeded();
    const heroCard = heroHeading.locator('xpath=ancestor::div[.//button[normalize-space()="Improve It"]][1]');
    const singleImproveStartedAt = Date.now();
    await heroCard.getByRole("button", { name: "Improve It" }).click();
    await waitForAudit(page, "hero_improved");
    const singleImproveMs = Date.now() - singleImproveStartedAt;
    await heroCard.getByText("Improved").waitFor();
    await caption(page, record, "Improve one channel", "The weak headline flips from TODO to a recorded before/after result in place.", 3_500);

    const allImproveButton = page.getByRole("button", { name: "Do It For You" }).first();
    await allImproveButton.scrollIntoViewIfNeeded();
    const improveAllStartedAt = Date.now();
    await allImproveButton.click();
    await waitForAudit(page, "preview");
    const improveAllMs = Date.now() - improveAllStartedAt;
    // Refresh the server-component payload after the API reaches its
    // authoritative complete+preview_ready state. This also makes the drill
    // robust if the optional live event stream is unavailable.
    await page.reload({ waitUntil: "domcontentloaded" });
    const previewBarVisible = await page.getByText("Your new page is ready.").isVisible();
    await caption(page, record, "Do It For You", "The remaining recorded improvements are applied and the assembled preview unlocks.", 3_500);

    // `preview_ready` is the stable product contract. Navigate to its public
    // preview URL after that assertion rather than depending on a transient
    // animated sticky bar or on row text that may change during polish.
    await page.goto(`${baseUrl}/audit/${auditId}/preview`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`**/audit/${auditId}/preview*`);
    await page.getByText("REPLAY SAMPLE", { exact: true }).first().waitFor();
    const afterToggle = page.getByRole("button", { name: /^after$/i });
    if (await afterToggle.count() === 0) {
      const bodyText = (await page.locator("body").innerText()).slice(0, 3_000);
      const apiState = await page.evaluate(async (id) => {
        const response = await fetch(`/api/audits/${id}?debug=${Date.now()}`, { cache: "no-store" });
        return response.json();
      }, auditId);
      throw new Error(`Preview controls missing at ${page.url()}. API state: ${JSON.stringify(apiState)}. DOM text:\n${bodyText}`);
    }
    await afterToggle.click();
    const aiConcept = page.getByText("AI concept").first();
    await aiConcept.waitFor();
    await aiConcept.scrollIntoViewIfNeeded();
    await caption(page, record, "Truth-labeled concept imagery", "Generated visuals are visibly badged AI concept; this preview is a proposal, not a deployed site.", 4_000);

    await page.getByRole("button", { name: /^split$/i }).click();
    const slider = page.getByRole("slider", { name: "Adjust before/after split" });
    const box = await slider.boundingBox();
    if (!box) throw new Error("Before/After slider did not render");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.min(1100, box.x + 240), box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.getByRole("button", { name: /changes$/ }).click();
    await caption(page, record, "Before / After with receipts", "Drag the divider and inspect the exact change list before anything is published.", 4_000);

    await page.getByRole("button", { name: "Close preview" }).click();
    await page.waitForURL(`**/audit/${auditId}`);
    await page.getByRole("link", { name: "History" }).click();
    await page.waitForURL("**/history");
    await page.getByRole("heading", { name: "History" }).waitFor();
    const historyRow = page.locator(`a[href="/audit/${auditId}"]`);
    await historyRow.getByText("REPLAY SAMPLE").waitFor();
    await caption(page, record, "Refresh-safe history", "The completed REPLAY audit is persisted and remains honestly labeled.", 3_000);

    const flowMs = Date.now() - flowStartedAt;
    if (flowMs >= 120_000) throw new Error(`Walkthrough exceeded 120 seconds: ${(flowMs / 1000).toFixed(2)}s`);
    if (consoleErrors.length > 0 || pageErrors.length > 0 || failedLocalRequests.length > 0) {
      throw new Error(JSON.stringify({ consoleErrors, pageErrors, failedLocalRequests }));
    }

    await context.close();
    context = null;
    if (video) {
      const rawPath = await video.path();
      await mkdir(dirname(videoPath), { recursive: true });
      await rm(videoPath, { force: true });
      await rename(rawPath, videoPath);
      recordedPath = videoPath;
    }

    return {
      run: runNumber,
      passed: true,
      executionMode: "REPLAY",
      truthBadge: "REPLAY SAMPLE",
      networkCondition: forceOffline
        ? "browser egress denied except localhost; server DEMO_MODE=replay; API keys blank"
        : "local production server; server DEMO_MODE=replay; API keys blank",
      abortToReplayDrill: true,
      serverReadyMs,
      sampleToScoreMs: scoreReadyMs,
      singleImproveMs,
      improveAllMs,
      walkthroughMs: flowMs,
      previewBarVisible,
      externalRequestsObserved: externalRequests,
      deniedExternalRequests,
      expectedNavigationAborts,
      localRequestFailures: failedLocalRequests,
      consoleErrors,
      pageErrors,
      assertions: {
        replayBadge: true,
        scoreAndEvidence: true,
        singleImprove: true,
        doItForYou: true,
        preview: true,
        aiConceptBadge: true,
        draggableDivider: true,
        historyPersistence: true,
      },
      videoPath: recordedPath,
      serverLogTail: log.join("").trim().split("\n").slice(-10),
    };
  } catch (error) {
    return {
      run: runNumber,
      passed: false,
      executionMode: "REPLAY",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      serverLogTail: log.join("").trim().split("\n").slice(-30),
    };
  } finally {
    if (context) await context.close().catch(() => {});
    await stopServer(child);
    await rm(runDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const buildIdPath = join(APP_DIR, ".next", "BUILD_ID");
  try {
    await readFile(buildIdPath, "utf8");
  } catch {
    throw new Error("Production build missing. Run `pnpm build` before this script.");
  }

  await mkdir(dirname(options.results), { recursive: true });
  // Snapshot the production build once. Next mutates `.next` during builds,
  // so a concurrent verification build must not invalidate a rehearsal that
  // has already started. All three runs use this identical read-only input.
  const serverDir = await mkdtemp(join(tmpdir(), "visibel-rehearsal-build-"));
  await cp(join(APP_DIR, ".next"), join(serverDir, ".next"), { recursive: true });
  await cp(join(APP_DIR, "package.json"), join(serverDir, "package.json"));
  await cp(join(APP_DIR, "next.config.ts"), join(serverDir, "next.config.ts"));
  await symlink(join(APP_DIR, "node_modules"), join(serverDir, "node_modules"));
  await symlink(join(APP_DIR, "public"), join(serverDir, "public"));
  const browser = await chromium.launch({ headless: !options.headed, args: ["--allow-file-access-from-files"] });
  const results = [];
  try {
    for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
      console.log(`Rehearsal ${runNumber}/${options.runs}...`);
      const result = await runOne({
        browser,
        runNumber,
        port: options.firstPort + runNumber - 1,
        record: runNumber === options.recordRun,
        videoPath: options.video,
        serverDir,
      });
      results.push(result);
      console.log(result.passed ? `PASS (${(result.walkthroughMs / 1000).toFixed(2)}s)` : `FAIL: ${result.error}`);
      if (!result.passed) break;
    }

    let videoDurationSeconds = null;
    if (options.recordRun > 0 && results.some((result) => result.videoPath)) {
      videoDurationSeconds = await probeVideoDuration(browser, options.video);
    }
    const document = {
      generatedAt: new Date().toISOString(),
      truthfulScope: "Automated REPLAY rehearsals only; no LIVE API calls or venue Wi-Fi claim.",
      allPassed: results.length === options.runs && results.every((result) => result.passed),
      video: options.recordRun > 0 ? {
        path: options.video,
        durationSeconds: videoDurationSeconds,
        hardLimitSeconds: 120,
        withinLimit: videoDurationSeconds === null
          ? results.find((result) => result.videoPath)?.walkthroughMs < 120_000
          : videoDurationSeconds <= 120,
      } : null,
      runs: results,
    };
    await writeFile(options.results, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    console.log(`Results: ${options.results}`);
    if (document.video) console.log(`Video: ${document.video.path} (${document.video.durationSeconds ?? "duration probe unavailable"}s)`);
    if (!document.allPassed || document.video?.withinLimit === false) process.exitCode = 1;
  } finally {
    await browser.close();
    await rm(serverDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
