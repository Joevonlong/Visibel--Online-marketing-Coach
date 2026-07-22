// Tavily integration (plan §2.4/§3, F-028 + Extract support for F-021/F-023).
// Tavily is the P0 must-use partner: findability must run in every LIVE audit
// and must never throw — a runtime error becomes an honest `status: "error"`
// result, never a crash and never a faked result.

import { tavily, type TavilyClient } from "@tavily/core";
import type { TavilyFindability } from "../schemas";

// ---------------------------------------------------------------------------
// Lazy client
// ---------------------------------------------------------------------------

let client: TavilyClient | null = null;

function getClient(): TavilyClient | null {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) return null;
  if (!client) {
    client = tavily({ apiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Findability classification (pure, network-free — exported for tests)
// ---------------------------------------------------------------------------

/** Directory/portal domains that list businesses without being their own
 *  site (plan §2.4: "gelbeseiten, check24, 11880, yelp, google maps etc."). */
const PORTAL_DOMAINS = [
  "gelbeseiten.de",
  "check24.de",
  "11880.com",
  "yelp.com",
  "yelp.de",
  "google.com", // maps.google.com / google.com/maps listings
  "goldenpages.ie",
  "dasoertliche.de",
  "meinestadt.de",
  "cylex.de",
  "wlw.de",
  "yellowpages.com",
];

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isPortalDomain(domain: string): boolean {
  return PORTAL_DOMAINS.some((p) => domain === p || domain.endsWith(`.${p}`));
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics (ä -> a + combining mark)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Does `text` mention the brand? Exact normalized substring match first;
 *  falls back to a majority-of-tokens match so minor punctuation/word-order
 *  differences (e.g. a title appending the city) still count. */
function mentionsBrand(text: string, brandName: string): boolean {
  const normText = normalizeForMatch(text);
  const normBrand = normalizeForMatch(brandName);
  if (normBrand.length === 0 || normText.length === 0) return false;
  if (normText.includes(normBrand)) return true;

  const tokens = normBrand.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => normText.includes(t)).length;
  return hits / tokens.length >= 0.6;
}

/** Pure classifier (F-028): brand mentioned on a non-portal domain → found;
 *  brand mentioned only on portal/directory domains → portals_only; brand
 *  not mentioned anywhere in the result set → not_found. Exported so the
 *  test suite can cover all three outcomes without a network call. */
export function classifyFindability(
  results: { title: string; url: string }[],
  brandName: string
): "found" | "portals_only" | "not_found" {
  let sawPortalMention = false;

  for (const r of results) {
    const domain = extractDomain(r.url);
    const portal = domain ? isPortalDomain(domain) : false;
    const mentioned = mentionsBrand(r.title, brandName) || mentionsBrand(r.url, brandName);
    if (!mentioned) continue;
    if (!portal) return "found";
    sawPortalMention = true;
  }

  return sawPortalMention ? "portals_only" : "not_found";
}

// ---------------------------------------------------------------------------
// Live calls
// ---------------------------------------------------------------------------

const MAX_RESULTS = 5;

/** ISS-005 — an English trade term ("plumber") sent Tavily's search to the
 *  wrong local market entirely (verified live: "plumber Berlin" surfaced
 *  "Berlin, NJ" results). Maps each `Trade` to the German search term a
 *  local customer would actually type; unmapped/unknown trades ("other")
 *  fall through to the raw trade string as-is. */
const GERMAN_TRADE_TERMS: Record<string, string> = {
  plumber: "Sanitär Heizung",
  electrician: "Elektriker",
  roofing: "Dachdecker",
  handyman: "Hausmeisterservice",
  doctor: "Arzt Praxis",
};

function germanTradeTerm(trade: string): string {
  return GERMAN_TRADE_TERMS[trade] ?? trade;
}

/** Live search "{German trade term} {city} {brand name}" in ONE query, so
 *  results are for the actual local market instead of an English query that
 *  can land in an unrelated (e.g. US) "Berlin" (ISS-005). Fallback drops
 *  the city when the first search comes back empty → TavilyFindability.
 *  Never throws: a missing key or any runtime error surfaces as an honest
 *  `status: "error"` with an empty result list, per plan §2.4 ("Tavily is
 *  never cut from the build"). */
export async function checkFindability(
  trade: string,
  city: string | undefined,
  brandName: string
): Promise<TavilyFindability> {
  const tavilyClient = getClient();
  if (!tavilyClient) {
    return { status: "error", results: [], source: "tavily" };
  }

  try {
    const term = germanTradeTerm(trade);
    const query = [term, city, brandName].filter(Boolean).join(" ");
    let response = await tavilyClient.search(query, { maxResults: MAX_RESULTS });

    if ((response.results ?? []).length === 0 && city) {
      const fallbackQuery = [term, brandName].filter(Boolean).join(" ");
      response = await tavilyClient.search(fallbackQuery, { maxResults: MAX_RESULTS });
    }

    const results = (response.results ?? [])
      .slice(0, MAX_RESULTS)
      .map((r) => ({ title: r.title, url: r.url }));

    return { status: classifyFindability(results, brandName), results, source: "tavily" };
  } catch {
    return { status: "error", results: [], source: "tavily" };
  }
}

/** Tavily Extract wrapper — used as the fetch fallback for website/portal
 *  evidence (F-021/F-023). Never throws; returns null on any failure
 *  (missing key, network error, no result). */
export async function tavilyExtract(url: string): Promise<{ raw_content: string } | null> {
  const tavilyClient = getClient();
  if (!tavilyClient) return null;

  try {
    const response = await tavilyClient.extract([url], { extractDepth: "basic" });
    const result = response.results?.[0];
    if (!result || !result.rawContent) return null;
    return { raw_content: result.rawContent };
  } catch {
    return null;
  }
}

/** Test-only escape hatch: reset the lazy singleton between tests that flip
 *  TAVILY_API_KEY. Not part of the public pipeline contract. */
export function __resetClientForTests(): void {
  client = null;
}
