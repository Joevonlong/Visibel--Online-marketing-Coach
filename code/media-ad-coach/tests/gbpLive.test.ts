// FEA-101 — live Google Maps corroboration.
//
// The DOM fixtures below are VERBATIM structure captured from real Google Maps
// place pages on 2026-07-21 (two Berlin trade businesses; every name, phone,
// address, and domain has been replaced with fictional stand-ins), trimmed to
// the nodes the parser reads. Nothing here hits the network: `extractLiveGbpFromHtml`
// is pure, and `fetchLiveGbp` is exercised through an injected fake runtime.
import { describe, expect, it, vi } from "vitest";
import {
  extractLiveGbpFromHtml,
  fetchLiveGbp,
  isSupportedMapsUrl,
  type LiveGbpBrowserRuntime,
} from "../lib/pipeline/gbp-live";
import { mergeGbpPrecedence, collectGbpEvidence } from "../lib/pipeline/gbp";

// Real capture: unclaimed listing — phone + rating present, NO opening hours,
// only a Street View fallback image, signed-out limited view (no reviews).
const BARE_LISTING_HTML = `
<html><body>
  <h1 class="DUwDvf lfPIob"><span class="a5H0ec"></span>Muster + Sohn GmbH<span class="G0bp3e"></span></h1>
  <div class="F7nice "><span><span aria-hidden="true">3.0</span><span class="ceNzKf" role="img" aria-label="3.0 stars "></span></span></div>
  <button data-item-id="address" aria-label="Address: Musterstraße 24, 10999 Berlin-Bezirk Friedrichshain-Kreuzberg ">Musterstraße 24, 10999 Berlin-Bezirk Friedrichshain-Kreuzberg</button>
  <a data-item-id="authority" aria-label="Website: muster-sanitaer.example ">muster-sanitaer.example</a>
  <button data-item-id="phone:tel:03012345678" aria-label="Phone: 030 12345678 ">030 12345678</button>
  <button data-item-id="oloc" aria-label="Plus code: AB12+CD Berlin">AB12+CD Berlin</button>
  <img src="https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=ExamplePanoidToken01&amp;w=408&amp;h=240">
  <div>You're seeing a limited view of Google Maps.</div>
</body></html>
`;

// Real capture: listing WITH owner photos and a today's-hours row.
const RICH_LISTING_HTML = `
<html><body>
  <h1 class="DUwDvf lfPIob">M. Mustermann Haustechnik</h1>
  <div class="F7nice "><span><span aria-hidden="true">4.8</span><span class="ceNzKf" role="img" aria-label="4.8 stars "></span></span><span><span aria-label="41 reviews">(41)</span></span></div>
  <button data-item-id="address" aria-label="Address: Beispielstraße 5, 10115 Berlin ">Beispielstraße 5, 10115 Berlin</button>
  <button data-item-id="phone:tel:0307654321" aria-label="Phone: 030 7654321 ">030 7654321</button>
  <div class="t39EBf">Tuesday7:30 am–4:30 pm<span>Suggest new hours</span></div>
  <img src="https://lh3.googleusercontent.com/gps-cs-s/ExamplePhotoToken=w408-h544-k-no">
  <img src="https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=ExamplePanoidToken02">
  <div data-review-id="ChZDS..1">
    <div class="d4r55">Erika M.</div>
    <span role="img" aria-label="5 stars"></span>
    <span class="wiI7pd">Schnelle Terminvergabe und saubere Arbeit — gerne wieder.</span>
  </div>
  <div data-review-id="ChZDS..2">
    <div class="d4r55">Max T.</div>
    <span role="img" aria-label="4 stars"></span>
    <span class="wiI7pd">Zuverlässig, fair und ordentlich gearbeitet.</span>
  </div>
</body></html>
`;

describe("isSupportedMapsUrl", () => {
  it("accepts the share short link and the canonical place URL", () => {
    expect(isSupportedMapsUrl("https://maps.app.goo.gl/ExampleMapTokenA1")).toBe(true);
    expect(isSupportedMapsUrl("https://www.google.com/maps/place/Muster+%2B+Sohn+GmbH/@52.5,13.4,17z")).toBe(true);
    expect(isSupportedMapsUrl("https://maps.google.de/?q=berlin")).toBe(true);
  });

  it("rejects a non-Maps link so no random URL is opened in a browser", () => {
    expect(isSupportedMapsUrl("https://www.muster-sanitaer.example/")).toBe(false);
    expect(isSupportedMapsUrl("https://www.google.com/search?q=plumber")).toBe(false);
    expect(isSupportedMapsUrl("not a url")).toBe(false);
    expect(isSupportedMapsUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("extractLiveGbpFromHtml — bare (unclaimed) listing", () => {
  const data = extractLiveGbpFromHtml(BARE_LISTING_HTML);

  it("reads the fields Maps actually shows", () => {
    expect(data.name).toBe("Muster + Sohn GmbH");
    expect(data.phone).toBe("030 12345678");
    expect(data.address).toBe("Musterstraße 24, 10999 Berlin-Bezirk Friedrichshain-Kreuzberg");
    expect(data.website).toBe("muster-sanitaer.example");
    expect(data.rating).toBe(3.0);
  });

  it("reports absent facts as null/false instead of inventing them", () => {
    expect(data.opening_hours_text).toBeNull();
    expect(data.has_listing_photos).toBe(false); // Street View fallback only
    expect(data.review_snippets).toEqual([]);
    expect(data.review_count).toBeNull();
    expect(data.limited_view).toBe(true); // so null review_count ≠ "zero reviews"
  });
});

describe("extractLiveGbpFromHtml — listing with photos, hours and reviews", () => {
  const data = extractLiveGbpFromHtml(RICH_LISTING_HTML);

  it("reads rating, review count, hours and photo presence", () => {
    expect(data.rating).toBe(4.8);
    expect(data.review_count).toBe(41);
    expect(data.opening_hours_text).toBe("Tuesday7:30 am–4:30 pm");
    expect(data.has_listing_photos).toBe(true);
    expect(data.limited_view).toBe(false);
  });

  it("reads at most 5 review snippets with author and stars", () => {
    expect(data.review_snippets).toHaveLength(2);
    expect(data.review_snippets[0]).toEqual({
      author: "Erika M.",
      rating: 5,
      text: "Schnelle Terminvergabe und saubere Arbeit — gerne wieder.",
    });
    expect(data.review_snippets[1].author).toBe("Max T.");
  });

  it("parses a comma-decimal (German) rating too", () => {
    expect(extractLiveGbpFromHtml(RICH_LISTING_HTML.replace(">4.8<", ">4,8<")).rating).toBe(4.8);
  });
});

// ---------------------------------------------------------------------------
// Browser shell — failure paths must degrade, never throw
// ---------------------------------------------------------------------------

function fakeRuntime(page: Partial<Record<string, unknown>>): LiveGbpBrowserRuntime {
  const fullPage = {
    goto: async () => undefined,
    url: () => "https://www.google.com/maps/place/Muster+%2B+Sohn+GmbH",
    content: async () => BARE_LISTING_HTML,
    waitForTimeout: async () => undefined,
    waitForSelector: async () => undefined,
    click: async () => undefined,
    ...page,
  };
  return {
    chromium: {
      launch: async () => ({
        newContext: async () => ({ newPage: async () => fullPage as never, close: async () => undefined }),
        close: async () => undefined,
      }),
    },
  } as LiveGbpBrowserRuntime;
}

describe("fetchLiveGbp", () => {
  it("returns the extracted listing data on a successful read", async () => {
    const result = await fetchLiveGbp(
      { mapsUrl: "https://maps.app.goo.gl/ExampleMapTokenA1" },
      { loadRuntime: async () => fakeRuntime({}), now: () => 1_770_000_000_000 }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution_mode).toBe("LIVE");
    expect(result.data.phone).toBe("030 12345678");
    expect(result.fetched_at).toBe(new Date(1_770_000_000_000).toISOString());
  });

  it("rejects a non-Maps URL before opening any browser", async () => {
    const loadRuntime = vi.fn();
    const result = await fetchLiveGbp({ mapsUrl: "https://www.muster-sanitaer.example/" }, { loadRuntime });
    expect(result).toMatchObject({ ok: false, reason: "not_a_maps_url" });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("degrades to playwright_unavailable when the browser package cannot be loaded", async () => {
    const result = await fetchLiveGbp(
      { mapsUrl: "https://maps.app.goo.gl/x" },
      {
        loadRuntime: async () => {
          throw new Error("Executable doesn't exist");
        },
      }
    );
    expect(result).toMatchObject({ ok: false, reason: "playwright_unavailable" });
  });

  it("degrades to consent_blocked when the consent interstitial never clears", async () => {
    const result = await fetchLiveGbp(
      { mapsUrl: "https://maps.app.goo.gl/x" },
      { loadRuntime: async () => fakeRuntime({ url: () => "https://consent.google.com/m?continue=..." }) }
    );
    expect(result).toMatchObject({ ok: false, reason: "consent_blocked" });
  });

  it("degrades to selector_miss when the page renders nothing recognizable", async () => {
    const result = await fetchLiveGbp(
      { mapsUrl: "https://maps.app.goo.gl/x" },
      { loadRuntime: async () => fakeRuntime({ content: async () => "<html><body>nope</body></html>" }) }
    );
    expect(result).toMatchObject({ ok: false, reason: "selector_miss" });
  });

  it("degrades to timeout instead of throwing", async () => {
    const result = await fetchLiveGbp(
      { mapsUrl: "https://maps.app.goo.gl/x" },
      {
        loadRuntime: async () =>
          fakeRuntime({
            goto: async () => {
              throw new Error("Navigation timeout of 20000 ms exceeded");
            },
          }),
      }
    );
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });
});

// ---------------------------------------------------------------------------
// Precedence merge + collector wiring
// ---------------------------------------------------------------------------

const LIVE_DATA = {
  name: "Muster + Sohn GmbH",
  phone: "030 12345678",
  address: "Musterstraße 24, 10999 Berlin",
  website: "muster-sanitaer.example",
  rating: 3.0,
  review_count: 7,
  opening_hours_text: null,
  has_listing_photos: false,
  review_snippets: [{ author: "Erika M.", rating: 5, text: "Schnell und freundlich." }],
  limited_view: false,
};

describe("mergeGbpPrecedence with live Maps data (FEA-101)", () => {
  it("keeps manual entry above the live read, but still carries the live-only fields", () => {
    const merged = mergeGbpPrecedence({ rating: 4.5, review_count: 12 }, null, true, {
      live: LIVE_DATA,
      liveFetchedAt: "2026-07-21T10:00:00.000Z",
    });
    expect(merged).toMatchObject({
      rating: 4.5,
      review_count: 12,
      source: "manual",
      phone: "030 12345678",
      has_listing_photos: false,
      live_source: "live_maps",
      live_fetched_at: "2026-07-21T10:00:00.000Z",
    });
  });

  it("puts the live read above screenshot vision-extraction", () => {
    const merged = mergeGbpPrecedence(
      null,
      { rating: 2.1, review_count: 3, has_photo_reviews: true, description: "Screenshot text." },
      true,
      { live: LIVE_DATA }
    );
    expect(merged).toMatchObject({ rating: 3.0, review_count: 7, has_photo_reviews: true, source: "screenshot" });
  });

  it("keeps `source` on its three frozen values — live is marked by live_source only", () => {
    const merged = mergeGbpPrecedence(null, null, true, { live: LIVE_DATA });
    expect(merged?.source).toBe("link");
    expect(merged?.live_source).toBe("live_maps");
  });

  it("records a structured live_error when the live read failed", () => {
    const merged = mergeGbpPrecedence(null, null, true, {
      liveError: { reason: "browser_unavailable", detail: "no chromium" },
    });
    expect(merged).toMatchObject({ source: "link", live_error: { reason: "browser_unavailable" } });
    expect(merged).not.toHaveProperty("live_source");
  });

  it("still returns null when there is no GBP signal at all", () => {
    expect(mergeGbpPrecedence(null, null, false, {})).toBeNull();
  });
});

describe("collectGbpEvidence — live fetch wiring", () => {
  it("never fetches live when no Maps URL was provided", async () => {
    const fetchLive = vi.fn();
    const evidence = await collectGbpEvidence({
      mapsUrl: null,
      gbpManual: null,
      screenshotDataUrls: [],
      brandName: "Muster + Sohn GmbH",
      trade: "plumber",
      fetchLive,
    });
    expect(fetchLive).not.toHaveBeenCalled();
    expect(evidence).toBeNull();
  });

  it("never fetches live when the caller opted out (replay/offline paths)", async () => {
    const fetchLive = vi.fn();
    await collectGbpEvidence({
      mapsUrl: "https://maps.app.goo.gl/x",
      gbpManual: null,
      screenshotDataUrls: [],
      brandName: "Muster + Sohn GmbH",
      trade: "plumber",
      allowLiveFetch: false,
      fetchLive,
    });
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it("persists the live fields when the read succeeds", async () => {
    const evidence = await collectGbpEvidence({
      mapsUrl: "https://maps.app.goo.gl/ExampleMapTokenA1",
      gbpManual: null,
      screenshotDataUrls: [],
      brandName: "Muster + Sohn GmbH",
      trade: "plumber",
      fetchLive: async () => ({
        ok: true,
        execution_mode: "LIVE",
        resolved_url: "https://www.google.com/maps/place/Muster+%2B+Sohn+GmbH",
        fetched_at: "2026-07-21T10:00:00.000Z",
        elapsed_ms: 5_000,
        data: LIVE_DATA,
      }),
    });
    expect(evidence).toMatchObject({
      rating: 3.0,
      review_count: 7,
      phone: "030 12345678",
      live_source: "live_maps",
    });
  });

  it("completes with an honest live_error when the read fails", async () => {
    const evidence = await collectGbpEvidence({
      mapsUrl: "https://maps.app.goo.gl/x",
      gbpManual: null,
      screenshotDataUrls: [],
      brandName: "Muster + Sohn GmbH",
      trade: "plumber",
      fetchLive: async () => ({
        ok: false,
        execution_mode: "HANDOFF_REQUIRED",
        reason: "consent_blocked",
        detail: "consent",
      }),
    });
    expect(evidence).toMatchObject({ source: "link", live_error: { reason: "consent_blocked" } });
  });
});
