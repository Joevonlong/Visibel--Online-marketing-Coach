// FEA-101 — live Google Maps listing corroboration.
//
// Human decision (2026-07-21): a pasted Maps link must contribute REAL listing
// data. The approved approach is a Playwright visit to the public listing page
// — deliberately NOT the official Places API, because that needs a new key,
// billing authorization and a credential the event has not approved. No new
// dependency either: `playwright` is already a direct dependency (ISS-022
// installed and pinned the Chromium build) and is loaded the same lazily,
// degrade-honestly way as lib/pipeline/screenshot.ts.
//
// Split by design:
//   * `extractLiveGbpFromHtml` — PURE, cheerio over the rendered DOM. Every
//     selector below was captured from a real 2026-07-21 run against live
//     listings, so it is testable offline against a saved HTML fixture.
//   * `fetchLiveGbp` — the thin browser shell (launch, consent, settle,
//     `page.content()`), which never throws and returns a structured
//     HANDOFF_REQUIRED reason on every failure path.
//
// Truth discipline: a field Google did not show is `null`/absent — never
// guessed, never carried over from another source. Signed-out Maps serves a
// "limited view" that omits the review list and review count entirely; that is
// reported as `limited_view: true` with `review_count: null` rather than
// silently implying the business has no reviews.

import * as cheerio from "cheerio";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_REVIEW_SNIPPETS = 5;

export interface LiveGbpReviewSnippet {
  author?: string;
  rating?: number;
  text: string;
}

export interface LiveGbpData {
  name: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  opening_hours_text: string | null;
  has_listing_photos: boolean | null;
  review_snippets: LiveGbpReviewSnippet[];
  /** Google serves signed-out visitors a reduced place panel ("You're seeing a
   *  limited view of Google Maps") with no review list and no review count.
   *  Surfaced so a `null` review_count is never mistaken for "zero reviews". */
  limited_view: boolean;
}

export type LiveGbpFailureReason =
  | "not_a_maps_url"
  | "playwright_unavailable"
  | "browser_unavailable"
  | "consent_blocked"
  | "timeout"
  | "selector_miss"
  | "fetch_failed";

export type LiveGbpResult =
  | {
      ok: true;
      execution_mode: "LIVE";
      /** The place URL Maps actually landed on (short links are followed). */
      resolved_url: string;
      fetched_at: string;
      elapsed_ms: number;
      data: LiveGbpData;
    }
  | {
      ok: false;
      execution_mode: "HANDOFF_REQUIRED";
      reason: LiveGbpFailureReason;
      detail: string;
    };

// ---------------------------------------------------------------------------
// URL handling
// ---------------------------------------------------------------------------

/** Accepts the forms a user realistically pastes: the `maps.app.goo.gl` share
 *  short link (followed by the browser, never by a hand-rolled redirect
 *  chase), `google.<tld>/maps/...`, and `maps.google.<tld>/...`. */
export function isSupportedMapsUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "maps.app.goo.gl" || host === "goo.gl" || host === "g.page") return true;
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
  if (/^(www\.)?google\.[a-z.]+$/.test(host)) return url.pathname.startsWith("/maps");
  return false;
}

// ---------------------------------------------------------------------------
// Pure extraction (cheerio over the rendered place panel)
// ---------------------------------------------------------------------------

function cleanText(value: string | undefined | null): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

/** `aria-label` on the place-panel action rows is prefixed with the field name
 *  ("Phone: 030 12345678", "Adresse: …"). Strips that prefix; falls back to the
 *  element's own text, which carries the same value without the prefix. */
function valueFromLabelledRow($: cheerio.CheerioAPI, selector: string): string | null {
  const el = $(selector).first();
  if (el.length === 0) return null;
  const aria = cleanText(el.attr("aria-label"));
  const stripped = aria ? aria.replace(/^[^:]{0,24}:\s*/, "") : null;
  return cleanText(stripped) ?? cleanText(el.text());
}

function parseRating(raw: string | null): number | null {
  if (!raw) return null;
  // Maps renders the rating localized — "4.8" (en) or "4,8" (de).
  const match = raw.match(/(\d(?:[.,]\d)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}

function parseReviewCount($: cheerio.CheerioAPI): number | null {
  // Full view renders the count next to the stars, either as an aria-labelled
  // link ("123 reviews" / "123 Rezensionen") or as a bare "(123)" span.
  let found: number | null = null;
  $("[aria-label]").each((_, el) => {
    if (found !== null) return;
    const aria = $(el).attr("aria-label") ?? "";
    const match = aria.match(/([\d.,  ]+)\s*(reviews?|Rezensionen|Bewertungen)/i);
    if (match) {
      const value = Number(match[1].replace(/[^\d]/g, ""));
      if (Number.isFinite(value)) found = value;
    }
  });
  if (found !== null) return found;

  const countText = cleanText($(".F7nice").text());
  const parenthesized = countText?.match(/\(([\d.,  ]+)\)/);
  if (parenthesized) {
    const value = Number(parenthesized[1].replace(/[^\d]/g, ""));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseOpeningHours($: cheerio.CheerioAPI): string | null {
  // `.t39EBf` is the collapsed "today's hours" row; `[data-item-id="oh"]` is
  // the expanded table's anchor. Either may be the one Maps rendered.
  const raw = cleanText($('[data-item-id="oh"]').first().text()) ?? cleanText($(".t39EBf").first().text());
  if (!raw) return null;
  // Drop the trailing edit affordances Maps appends inside the same node.
  const text = raw.replace(/\s*(Suggest new hours|Öffnungszeiten vorschlagen|Add hours|Öffnungszeiten hinzufügen)\s*$/i, "").trim();
  return text.length > 0 ? text : null;
}

/** Real listing photos are served from googleusercontent/ggpht. A listing with
 *  NO owner or visitor photos falls back to a Street View thumbnail
 *  (`streetviewpixels-pa.googleapis.com`) — the observable difference between
 *  "has photos" and "has none". */
function parseHasListingPhotos($: cheerio.CheerioAPI): boolean | null {
  let sawStreetView = false;
  let sawListingPhoto = false;
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    if (/streetviewpixels-pa\.googleapis\.com/.test(src)) sawStreetView = true;
    if (/(googleusercontent|ggpht)\.com/.test(src)) sawListingPhoto = true;
  });
  if (sawListingPhoto) return true;
  if (sawStreetView) return false;
  // Neither marker present — the photo strip did not render at all, which is
  // "unknown", not "no photos".
  return null;
}

function parseReviewSnippets($: cheerio.CheerioAPI): LiveGbpReviewSnippet[] {
  const snippets: LiveGbpReviewSnippet[] = [];
  // Maps renders each review twice in some panel states (original + translated
  // copy share the same author/text), so identical entries are collapsed —
  // otherwise a listing with 2 reviews looks like it has 5.
  const seen = new Set<string>();
  $("[data-review-id]").each((_, el) => {
    if (snippets.length >= MAX_REVIEW_SNIPPETS) return;
    const node = $(el);
    const text = cleanText(node.find(".wiI7pd").first().text());
    if (!text) return;
    const key = `${cleanText(node.find(".d4r55").first().text()) ?? ""}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    const author = cleanText(node.find(".d4r55").first().text());
    const rating = parseRating(node.find("[role='img'][aria-label]").first().attr("aria-label") ?? null);
    snippets.push({
      ...(author ? { author } : {}),
      ...(rating !== null ? { rating } : {}),
      text,
    });
  });
  return snippets;
}

/** Pure DOM→data extraction. Every field is independently optional: a listing
 *  that shows no hours yields `opening_hours_text: null` while still returning
 *  the phone it does show. */
export function extractLiveGbpFromHtml(html: string): LiveGbpData {
  const $ = cheerio.load(html);

  const phoneRow = valueFromLabelledRow($, '[data-item-id^="phone:tel:"]');
  const rating = parseRating(cleanText($(".F7nice span[aria-hidden='true']").first().text()));

  return {
    name: cleanText($("h1").first().text()),
    phone: phoneRow,
    address: valueFromLabelledRow($, '[data-item-id="address"]'),
    website: valueFromLabelledRow($, '[data-item-id="authority"]'),
    rating,
    review_count: parseReviewCount($),
    opening_hours_text: parseOpeningHours($),
    has_listing_photos: parseHasListingPhotos($),
    review_snippets: parseReviewSnippets($),
    limited_view: /limited view of Google Maps|eingeschränkte Ansicht von Google Maps/i.test(html),
  };
}

function hasAnyLiveField(data: LiveGbpData): boolean {
  return (
    data.name !== null ||
    data.phone !== null ||
    data.address !== null ||
    data.rating !== null ||
    data.review_count !== null ||
    data.opening_hours_text !== null ||
    data.has_listing_photos !== null ||
    data.review_snippets.length > 0
  );
}

// ---------------------------------------------------------------------------
// Browser shell
// ---------------------------------------------------------------------------

interface PageLike {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  url(): string;
  content(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
  click(selector: string, options: { timeout: number }): Promise<unknown>;
  /** Optional so a test double can stay minimal — the scroll pass below is a
   *  best-effort enrichment, never a requirement. */
  evaluate?(fn: () => unknown): Promise<unknown>;
}

interface ContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export interface LiveGbpBrowserRuntime {
  chromium: {
    launch(options: { headless: boolean }): Promise<{
      newContext(options: {
        viewport: { width: number; height: number };
        locale: string;
        userAgent: string;
      }): Promise<ContextLike>;
      close(): Promise<void>;
    }>;
  };
}

export interface FetchLiveGbpInput {
  mapsUrl: string;
  /** Reserved corroboration context (a future "is this the right place?" check
   *  can compare these against the extracted name/address). Not read today —
   *  nothing is inferred from them, so nothing can be fabricated from them. */
  brandName?: string | null;
  trade?: string | null;
  city?: string | null;
  timeoutMs?: number;
}

export interface FetchLiveGbpDependencies {
  loadRuntime?: () => Promise<LiveGbpBrowserRuntime>;
  now?: () => number;
}

async function loadPlaywright(): Promise<LiveGbpBrowserRuntime> {
  // Same lazy resolution as lib/pipeline/screenshot.ts: a deployment without
  // the browser bundle degrades truthfully instead of failing at import.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  return (await dynamicImport("playwright")) as LiveGbpBrowserRuntime;
}

/** EU visitors hit a consent interstitial before Maps renders. Both buttons
 *  yield the identical (limited) place panel — verified 2026-07-21 — so this
 *  picks "reject all" and stores no advertising cookies. The browser context is
 *  discarded either way. */
const CONSENT_SELECTOR =
  'button[aria-label="Alle ablehnen"], button[aria-label="Reject all"], form[action*="consent.google.com/save"] button';

function isConsentUrl(url: string): boolean {
  return /consent\.google\.com/.test(url);
}

export async function fetchLiveGbp(
  input: FetchLiveGbpInput,
  dependencies: FetchLiveGbpDependencies = {}
): Promise<LiveGbpResult> {
  const now = dependencies.now ?? (() => Date.now());
  const startedAt = now();

  if (!isSupportedMapsUrl(input.mapsUrl)) {
    return {
      ok: false,
      execution_mode: "HANDOFF_REQUIRED",
      reason: "not_a_maps_url",
      detail: "The provided link is not a Google Maps listing URL.",
    };
  }

  let runtime: LiveGbpBrowserRuntime;
  try {
    runtime = await (dependencies.loadRuntime ?? loadPlaywright)();
  } catch {
    return {
      ok: false,
      execution_mode: "HANDOFF_REQUIRED",
      reason: "playwright_unavailable",
      detail: "Playwright is unavailable; live Google Maps corroboration was skipped.",
    };
  }

  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
  let browser: Awaited<ReturnType<LiveGbpBrowserRuntime["chromium"]["launch"]>> | undefined;
  let context: ContextLike | undefined;
  try {
    browser = await runtime.chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 1200 },
      locale: "en-GB",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(input.mapsUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // Consent interstitial (EU): dismiss it, then let the redirect back to the
    // place page settle. A missing button is fine — outside the EU there is no
    // interstitial at all.
    try {
      await page.waitForSelector(CONSENT_SELECTOR, { timeout: 6_000 });
      await page.click(CONSENT_SELECTOR, { timeout: 6_000 });
      await page.waitForTimeout(2_500);
    } catch {
      /* no consent screen — continue */
    }

    if (isConsentUrl(page.url())) {
      return {
        ok: false,
        execution_mode: "HANDOFF_REQUIRED",
        reason: "consent_blocked",
        detail: "Google's consent interstitial could not be dismissed; no live Maps data was read.",
      };
    }

    // The place panel hydrates after navigation; h1 is the first thing it
    // paints. Missing h1 is not fatal on its own — the extraction below decides.
    await page.waitForSelector("h1", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(2_000);

    // The reviews block sits below the fold of the place panel and is only
    // populated once that panel is scrolled. Best-effort: a failure here just
    // means fewer review snippets, never a failed read.
    if (page.evaluate) {
      for (let pass = 0; pass < 2; pass++) {
        await page
          .evaluate(() => {
            const panels = Array.from(document.querySelectorAll("div")).filter(
              (el) => el.scrollHeight > el.clientHeight + 200 && el.clientHeight > 300 && el.getBoundingClientRect().left < 600
            );
            panels.sort((a, b) => b.scrollHeight - a.scrollHeight);
            if (panels[0]) panels[0].scrollTop += 1_200;
          })
          .catch(() => undefined);
        await page.waitForTimeout(1_200);
      }
    }

    const html = await page.content();
    const data = extractLiveGbpFromHtml(html);
    if (!hasAnyLiveField(data)) {
      return {
        ok: false,
        execution_mode: "HANDOFF_REQUIRED",
        reason: "selector_miss",
        detail: "The Maps listing page rendered, but no known listing field could be read from it.",
      };
    }

    return {
      ok: true,
      execution_mode: "LIVE",
      resolved_url: page.url(),
      fetched_at: new Date(now()).toISOString(),
      elapsed_ms: now() - startedAt,
      data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timed out|timeout/i.test(message)) {
      return {
        ok: false,
        execution_mode: "HANDOFF_REQUIRED",
        reason: "timeout",
        detail: "Live Google Maps corroboration timed out.",
      };
    }
    const reason: LiveGbpFailureReason = browser ? "fetch_failed" : "browser_unavailable";
    return {
      ok: false,
      execution_mode: "HANDOFF_REQUIRED",
      reason,
      detail: `Live Google Maps corroboration failed: ${message}`,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
