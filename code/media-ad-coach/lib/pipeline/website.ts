// Website + portal evidence acquisition (plan §3.1/§3.4, F-020/F-021/F-022/F-023).
// Ladder for every presence URL: server-side fetch -> cheerio extraction ->
// (fetch failed OR extracted text too thin) -> Tavily Extract fallback ->
// both fail -> null. Never throws, never fabricates evidence.

import * as cheerio from "cheerio";
import {
  type ImgCandidate,
  type PortalEvidence,
  PortalPlatform,
  type SectionTaggedText,
  type WebsiteEvidence,
  type WebsiteTextSection,
} from "../schemas";
import { extractDomain, tavilyExtract } from "./tavily";

const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;
// Raised from 8_000 (ISS-003): a crawl now folds up to 5 subpages into one
// WebsiteEvidence, so the homepage-only cap was truncating real content
// before the subpage crawl even had a chance to contribute.
const VISIBLE_TEXT_CAP = 12_000;
const WEBSITE_THIN_THRESHOLD = 200;
const PORTAL_THIN_THRESHOLD = 100;
const CHUNK_SIZE = 2_000;
// Same-domain links collected off the homepage (ISS-003) — generous enough
// to cover real nav/footer link sprawl without an unbounded crawl surface.
const MAX_SAME_DOMAIN_LINKS = 40;
// Bounded subpage crawl (ISS-003): Kontakt/Impressum/Leistungen-style pages
// routinely carry the phone/email/legal signal a homepage omits.
const MAX_PRIORITY_SUBPAGES = 5;
// Bounded image-gallery crawl (ISS-014): a small business's real work photos
// live on a Bildergalerie/Referenzen/Projekte page the homepage links to but
// the text-priority crawl above never selects — so the only images harvested
// were the homepage's logos. Crawled IN ADDITION to the text-priority pages so
// contact/legal text and real photos never starve each other.
const MAX_IMAGE_GALLERY_SUBPAGES = 3;
// One subpage can't crowd out the others inside VISIBLE_TEXT_CAP.
const SUBPAGE_TEXT_CONTRIBUTION_CAP = 2_000;
const MAX_CONTACT_MATCHES = 5;
// A body-level rescue (see collectVisibleText) only fires when the whole
// stripped page is meaningfully more useful than a bare "just over the thin
// line" reading — not just a handful of chars past WEBSITE_THIN_THRESHOLD.
const BODY_RESCUE_MIN_CHARS = 400;

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function tryFetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": REALISTIC_USER_AGENT },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Platform detection (F-023)
// ---------------------------------------------------------------------------

export function detectPlatform(url: string): PortalPlatform {
  const domain = extractDomain(url) ?? "";
  if (domain.includes("gelbeseiten")) return "yellow_pages";
  if (domain.includes("check24")) return "check24";
  return "other";
}

// ---------------------------------------------------------------------------
// Website extraction (pure, network-free — exported for tests)
// ---------------------------------------------------------------------------

const ABOUT_HEADING = /(about|über uns|wer wir sind|unternehmen|team)/i;
const SERVICES_HEADING = /(services|leistungen|angebot|wir bieten|unsere leistungen)/i;
const LEGAL_LINK_PATTERN = {
  impressum: /impressum/i,
  datenschutz: /(datenschutz|privacy)/i,
};

// German phone numbers in various house-style formats, e.g. "030 1234567",
// "+49 30 123456", "0175-1234567". Shared by the portal extractor further
// below and by extractContactSignals (ISS-004).
const PHONE_PATTERN = /(\+49[\s\-/]?\d[\d\s\-/]{5,}\d|0\d{2,5}[\s\-/]?\d{3,}[\s\-/]?\d{0,4})/;
// Conservative email pattern — good enough to recover a plainly-printed
// address, not a full RFC 5322 validator.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// Kontakt/Impressum/Datenschutz-style pages (ISS-003): tagged "footer" when
// merged, same as the homepage's own footer element.
const SUBPAGE_FOOTER_PATTERN = /(kontakt|contact|impressum|datenschutz)/i;
// Leistungen/Angebot/Service-style pages: tagged "services" when merged.
const SUBPAGE_SERVICES_PATTERN = /(leistungen|angebot|service)/i;
// Priority subpage selection (ISS-003) — matched against the resolved URL.
// Superset of the footer/services patterns above (adds über/about/team/...,
// which fall through to the "about" tag when merged).
const PRIORITY_LINK_PATTERN =
  /(kontakt|contact|impressum|datenschutz|leistungen|angebot|ueber|über|about|unternehmen|service|team|referenzen)/i;
// Image-gallery subpage selection (ISS-014) — matched against the resolved
// URL. Bildergalerie/Galerie/Gallery/Referenzen/Projekte/Portfolio-style pages
// are where real work photos actually live.
const IMAGE_GALLERY_LINK_PATTERN =
  /(bildergalerie|galerie|gallery|referenzen|projekte|projekt|projects|portfolio|fotos|photos|bilder|arbeiten|impressionen)/i;

// Avoids importing domhandler's `AnyNode` type directly: it is only a
// transitive dependency (via cheerio), and pnpm's strict node_modules
// linking does not expose it to this package's own imports. `.prop` on a
// Cheerio selection is typed to return string | undefined, which is enough.
const SECTION_BOUNDARY_TAGS = new Set(["H1", "H2", "H3", "FOOTER", "NAV", "HEADER"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSectionBoundary($node: cheerio.Cheerio<any>): boolean {
  const tag = $node.prop("tagName");
  return typeof tag === "string" && SECTION_BOUNDARY_TAGS.has(tag.toUpperCase());
}

function collectSections($: cheerio.CheerioAPI): SectionTaggedText[] {
  const sections: SectionTaggedText[] = [];
  let used = 0;

  function push(section: WebsiteTextSection, raw: string) {
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const remaining = VISIBLE_TEXT_CAP - used;
    if (remaining <= 0) return;
    const slice = trimmed.slice(0, remaining);
    sections.push({ section, text: slice });
    used += slice.length;
  }

  // Footer — dedicated element, always tagged "footer".
  $("footer").each((_, el) => push("footer", $(el).text()));

  const headings = $("h1, h2, h3").toArray();

  // Hero — first heading on the page plus the sibling text up to the next
  // heading (a pragmatic stand-in for "above the fold").
  const firstHeading = headings[0];
  if (firstHeading) {
    let heroText = $(firstHeading).text();
    let node = $(firstHeading).next();
    let guard = 0;
    while (node.length > 0 && !isSectionBoundary(node) && guard < 5) {
      heroText += " " + node.text();
      node = node.next();
      guard++;
    }
    push("hero", heroText);
  }

  // About / services — any other heading whose text matches the keyword
  // sets, plus its following siblings up to the next heading.
  for (const heading of headings) {
    const headingText = $(heading).text();
    let sectionType: "about" | "services" | null = null;
    if (ABOUT_HEADING.test(headingText)) sectionType = "about";
    else if (SERVICES_HEADING.test(headingText)) sectionType = "services";
    if (!sectionType) continue;

    let text = headingText;
    let node = $(heading).next();
    let guard = 0;
    while (node.length > 0 && !isSectionBoundary(node) && guard < 10) {
      text += " " + node.text();
      node = node.next();
      guard++;
    }
    push(sectionType, text);
  }

  return sections;
}

function chunkTextIntoHeroSections(text: string, cap: number): SectionTaggedText[] {
  const capped = text.slice(0, cap);
  const chunks: SectionTaggedText[] = [];
  for (let i = 0; i < capped.length; i += CHUNK_SIZE) {
    chunks.push({ section: "hero", text: capped.slice(i, i + CHUNK_SIZE) });
  }
  return chunks;
}

/** Whole-body text with script/style/noscript/nav stripped, whitespace
 *  collapsed. Re-parses `html` into its own Cheerio instance rather than
 *  mutating the caller's `$` (which other extraction steps — nav_links,
 *  has_impressum/has_datenschutz — still need to run against, including
 *  links that live inside a <nav>). */
function extractStrippedBodyText(html: string): string {
  const $rescue = cheerio.load(html);
  $rescue("script, style, noscript, nav").remove();
  return $rescue("body").text().replace(/\s+/g, " ").trim();
}

/** Real pages built with page-builder markup often nest a heading alone in
 *  its own wrapper div — no sibling text at that level — while the actual
 *  copy lives several levels deeper in an unrelated part of the tree.
 *  collectSections()'s sibling walk under-reads those pages even though the
 *  fetch succeeded and the content is real (confirmed live against a real
 *  page-builder site, name withheld: a genuine 200 OK, ~59KB page that the
 *  sibling walk captured as ~197 chars). Rather than let that false "too
 *  thin" reading fall through to the Tavily fallback — which, without a key,
 *  turns an honestly-reachable page into a fabricated-looking `null` — fall
 *  back to the whole stripped body text when it is substantially larger than
 *  what the section walk found. Still `source: "fetched"`: this is real DOM
 *  content, just recovered with a coarser heuristic than section tagging. */
function collectVisibleText(html: string, $: cheerio.CheerioAPI): SectionTaggedText[] {
  const sections = collectSections($);
  const sectionWalkTotal = sections.reduce((sum, s) => sum + s.text.length, 0);
  if (sectionWalkTotal >= WEBSITE_THIN_THRESHOLD) return sections;

  const bodyText = extractStrippedBodyText(html);
  const substantiallyLarger =
    bodyText.length >= BODY_RESCUE_MIN_CHARS && bodyText.length > sectionWalkTotal * 2;
  if (!substantiallyLarger) return sections;

  return chunkTextIntoHeroSections(bodyText, VISIBLE_TEXT_CAP);
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function hasLegalLink($: cheerio.CheerioAPI, pattern: RegExp): boolean {
  let found = false;
  $("a").each((_, el) => {
    if (found) return;
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const text = $el.text();
    if (pattern.test(href) || pattern.test(text)) found = true;
  });
  return found;
}

function dedupPreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

const SKIPPED_LINK_PREFIXES = ["mailto:", "tel:", "javascript:"];

/** Same-domain links collected from EVERY `<a href>` on the page — not just
 *  `<nav> a` (ISS-003: old-school sites without a `<nav>` element left
 *  `nav_links` empty). Resolved absolute, same registrable host only
 *  (`#`/mailto:/tel:/javascript: dropped), deduped, capped. */
function extractSameDomainLinksFromCheerio(
  $: cheerio.CheerioAPI,
  baseUrl: string
): string[] {
  const baseDomain = extractDomain(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    // "#" and same-page fragment anchors like "#top" never lead to a new
    // page, so both are dropped here — not just the bare "#" case.
    if (!href || href.startsWith("#")) return;
    if (SKIPPED_LINK_PREFIXES.some((prefix) => href.toLowerCase().startsWith(prefix))) return;

    const resolved = resolveUrl(href, baseUrl);
    const linkDomain = extractDomain(resolved);
    if (!baseDomain || !linkDomain || linkDomain !== baseDomain) return;
    if (seen.has(resolved)) return;
    seen.add(resolved);
    links.push(resolved);
  });

  return links.slice(0, MAX_SAME_DOMAIN_LINKS);
}

/** Exported, network-free wrapper around {@link extractSameDomainLinksFromCheerio}
 *  for direct testing against inline HTML fixtures. */
export function collectSameDomainLinks(html: string, baseUrl: string): string[] {
  return extractSameDomainLinksFromCheerio(cheerio.load(html), baseUrl);
}

/** Picks up to `max` links that look like a Kontakt/Impressum/Leistungen/
 *  Über-uns-style subpage (ISS-003), preserving discovery order. Pure —
 *  exported for tests. */
export function selectPriorityLinks(
  links: readonly string[],
  max: number = MAX_PRIORITY_SUBPAGES
): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (selected.length >= max) break;
    if (seen.has(link)) continue;
    if (!PRIORITY_LINK_PATTERN.test(link)) continue;
    seen.add(link);
    selected.push(link);
  }
  return selected;
}

/** Picks up to `max` links that look like an image-gallery/portfolio subpage
 *  (ISS-014: Bildergalerie/Referenzen/Projekte/...), preserving discovery
 *  order. Pure — exported for tests. */
export function selectImageGalleryLinks(
  links: readonly string[],
  max: number = MAX_IMAGE_GALLERY_SUBPAGES
): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (selected.length >= max) break;
    if (seen.has(link)) continue;
    if (!IMAGE_GALLERY_LINK_PATTERN.test(link)) continue;
    seen.add(link);
    selected.push(link);
  }
  return selected;
}

/** Maps a crawled subpage URL onto the ONE frozen `WebsiteTextSection` its
 *  merged text is tagged with (ISS-003) — "footer" for Kontakt/Impressum/
 *  Datenschutz, "services" for Leistungen/Angebot/Service, "about" for
 *  everything else (Über uns/Team/Referenzen/...). Pure — exported for
 *  tests. */
export function classifySubpageSection(url: string): WebsiteTextSection {
  if (SUBPAGE_FOOTER_PATTERN.test(url)) return "footer";
  if (SUBPAGE_SERVICES_PATTERN.test(url)) return "services";
  return "about";
}

/** Collects contact email addresses from a page: `mailto:` hrefs (address
 *  portion only, query stripped) plus a conservative regex pass over the
 *  visible body text (script/style/noscript removed first). Pure and
 *  network-free — exported so both the homepage and each crawled subpage
 *  (ISS-003) can be extracted and tested the same way. */
export function collectEmailsFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const found: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const address = href.replace(/^mailto:/i, "").split("?")[0].trim();
    if (address) found.push(address);
  });

  const bodyText = $("body").text();
  const textMatches = [...bodyText.matchAll(new RegExp(EMAIL_PATTERN.source, "gi"))].map((m) =>
    m[0].trim()
  );
  found.push(...textMatches);

  return dedupPreserveOrder(found).slice(0, MAX_CONTACT_MATCHES);
}

/** Collects `<img>` candidates from a parsed document, resolving each `src`
 *  absolute against `baseUrl` and carrying the declared width/height as
 *  `natural_size` when both are present. Shared by the homepage extractor and
 *  the per-subpage provenance pass (ISS-014) so both read images identically. */
function collectImgCandidates($: cheerio.CheerioAPI, baseUrl: string): ImgCandidate[] {
  const imgCandidates: ImgCandidate[] = [];
  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    if (!src) return;
    const alt = $el.attr("alt") ?? null;
    const widthAttr = $el.attr("width");
    const heightAttr = $el.attr("height");
    const width = widthAttr ? parseInt(widthAttr, 10) : NaN;
    const height = heightAttr ? parseInt(heightAttr, 10) : NaN;
    imgCandidates.push({
      src: resolveUrl(src, baseUrl),
      alt,
      ...(Number.isFinite(width) && Number.isFinite(height)
        ? { natural_size: { width, height } }
        : {}),
    });
  });
  return imgCandidates;
}

/** Network-free `<img>` extraction from raw HTML — used to attribute each
 *  crawled subpage's images to that subpage's URL (ISS-014). */
export function extractImgCandidatesFromHtml(html: string, baseUrl: string): ImgCandidate[] {
  return collectImgCandidates(cheerio.load(html), baseUrl);
}

// ISS-014: per-image provenance — a map of each image's normalized absolute
// src to the page URL its `<img>` tag was found on. Keyed identically to the
// survivor srcs lib/pipeline/images.ts harvests, so the source page resolves
// through to each stored asset's meta_json.source_page.
export type ImageSourceMap = Map<string, string>;

/** Records each image's normalized src -> `pageUrl`, first-writer-wins so the
 *  homepage keeps attribution over a later subpage that reuses the same asset. */
function addImageSources(map: ImageSourceMap, imgs: readonly ImgCandidate[], pageUrl: string): void {
  for (const img of imgs) {
    const key = normalizeImgSrcForDedup(img.src);
    if (!map.has(key)) map.set(key, pageUrl);
  }
}

/** Provenance map for a single already-extracted page (the ISS-012 rendered-DOM
 *  fallback path, where every image came from the one entry-page URL). */
export function imageSourcesForSinglePage(evidence: WebsiteEvidence, pageUrl: string): ImageSourceMap {
  const map: ImageSourceMap = new Map();
  addImageSources(map, evidence.img_candidates, pageUrl);
  return map;
}

/** Cheerio extraction of a fetched HTML document into WebsiteEvidence
 *  (`source: "fetched"`). Pure and network-free so it is directly testable
 *  against inline HTML fixtures. */
export function extractWebsiteEvidenceFromHtml(html: string, baseUrl: string): WebsiteEvidence {
  const $ = cheerio.load(html);

  const telLinks: string[] = [];
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) telLinks.push(href);
  });

  // ISS-003: every same-domain link, not just <nav> a — old-school sites
  // without a <nav> element left this empty.
  const navLinks = extractSameDomainLinksFromCheerio($, baseUrl);

  const imgCandidates = collectImgCandidates($, baseUrl);

  const viewportMeta = $('meta[name="viewport"]').attr("content");

  // ISS-003/ISS-004: lib/schemas.ts's WebsiteEvidence is frozen (no email
  // field), so any discovered address is folded into visible_text as a real
  // "footer" block — genuine, evidence-derived text the Copy Strategist and
  // extractContactSignals both read the normal way, not a synthetic field.
  const visibleText = collectVisibleText(html, $);
  const emails = collectEmailsFromHtml(html);
  if (emails.length > 0) {
    visibleText.push({ section: "footer", text: `Contact email(s) found on site: ${emails.join(", ")}` });
  }

  return {
    source: "fetched",
    https: baseUrl.startsWith("https://"),
    title: $("title").first().text().trim() || null,
    h1: $("h1").first().text().trim() || null,
    meta_description: $('meta[name="description"]').attr("content")?.trim() || null,
    has_viewport_meta: !!viewportMeta,
    tel_links: telLinks,
    visible_text: visibleText,
    nav_links: navLinks,
    has_impressum: hasLegalLink($, LEGAL_LINK_PATTERN.impressum),
    has_datenschutz: hasLegalLink($, LEGAL_LINK_PATTERN.datenschutz),
    img_candidates: imgCandidates,
  };
}

/** "Too thin" predicate (F-021): drives the JS-shell fallback decision.
 *  Exported so the too-thin path is testable without a network call. */
export function isEvidenceTooThin(visibleText: SectionTaggedText[]): boolean {
  const total = visibleText.reduce((sum, s) => sum + s.text.length, 0);
  return total < WEBSITE_THIN_THRESHOLD;
}

function normalizeImgSrcForDedup(src: string): string {
  try {
    const u = new URL(src);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return src;
  }
}

export interface FetchedSubpage {
  url: string;
  html: string;
}

/** Merges already-fetched subpages (Kontakt/Impressum/Leistungen/...) into
 *  the homepage `WebsiteEvidence` (ISS-003). Pure and network-free —
 *  `subpages` carries raw HTML rather than a live fetch, so this is directly
 *  testable against inline fixtures. Each subpage is re-extracted with
 *  {@link extractWebsiteEvidenceFromHtml} (same tel/img/legal/email logic as
 *  the homepage); its combined text is re-tagged into a SINGLE frozen
 *  WebsiteTextSection by URL keyword ({@link classifySubpageSection}) rather
 *  than kept as per-heading hero/about/services — the homepage's own
 *  per-heading tagging is left untouched. tel_links union-dedupes, legal
 *  flags OR-merge, and img candidates dedupe by normalized URL. */
export function mergeSubpageEvidence(
  base: WebsiteEvidence,
  subpages: readonly FetchedSubpage[]
): WebsiteEvidence {
  const visibleText: SectionTaggedText[] = [...base.visible_text];
  let usedTotal = visibleText.reduce((sum, s) => sum + s.text.length, 0);
  const telLinks = new Set(base.tel_links);
  const imgCandidates: ImgCandidate[] = [...base.img_candidates];
  const seenImgSrc = new Set(base.img_candidates.map((c) => normalizeImgSrcForDedup(c.src)));
  let hasImpressum = base.has_impressum;
  let hasDatenschutz = base.has_datenschutz;

  for (const { url, html } of subpages) {
    const subEvidence = extractWebsiteEvidenceFromHtml(html, url);
    const section = classifySubpageSection(url);

    const combinedText = subEvidence.visible_text
      .map((s) => s.text)
      .join(" ")
      .trim();
    if (combinedText) {
      const remainingTotal = Math.max(VISIBLE_TEXT_CAP - usedTotal, 0);
      const take = Math.min(SUBPAGE_TEXT_CONTRIBUTION_CAP, remainingTotal);
      if (take > 0) {
        const slice = combinedText.slice(0, take);
        visibleText.push({ section, text: slice });
        usedTotal += slice.length;
      }
    }

    for (const tel of subEvidence.tel_links) telLinks.add(tel);

    for (const img of subEvidence.img_candidates) {
      const key = normalizeImgSrcForDedup(img.src);
      if (seenImgSrc.has(key)) continue;
      seenImgSrc.add(key);
      imgCandidates.push(img);
    }

    hasImpressum = hasImpressum || subEvidence.has_impressum;
    hasDatenschutz = hasDatenschutz || subEvidence.has_datenschutz;
  }

  return {
    ...base,
    visible_text: visibleText,
    tel_links: [...telLinks],
    img_candidates: imgCandidates,
    has_impressum: hasImpressum,
    has_datenschutz: hasDatenschutz,
  };
}

/** Fetches the union of the text-priority links (ISS-003) and the image-
 *  gallery links (ISS-014) in parallel — each reuses `tryFetchHtml`'s own 10s
 *  timeout, and a failed fetch is silently skipped (never fatal), consistent
 *  with every other evidence helper in this file. Deduped, gallery pages
 *  appended after the text-priority ones so a contact/legal page is never
 *  crowded out by a gallery and vice versa. */
async function crawlPrioritySubpages(navLinks: readonly string[]): Promise<FetchedSubpage[]> {
  const textTargets = selectPriorityLinks(navLinks);
  const galleryTargets = selectImageGalleryLinks(navLinks);
  const targets = dedupPreserveOrder([...textTargets, ...galleryTargets]);
  if (targets.length === 0) return [];

  const settled = await Promise.allSettled(
    targets.map(async (url): Promise<FetchedSubpage | null> => {
      const html = await tryFetchHtml(url);
      return html ? { url, html } : null;
    })
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<FetchedSubpage | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is FetchedSubpage => v !== null);
}

export interface ContactSignals {
  phones: string[];
  emails: string[];
  has_impressum: boolean;
  has_datenschutz: boolean;
}

/** Out-of-band contact summary derived from an already-built `WebsiteEvidence`
 *  (ISS-004) — `lib/schemas.ts` is frozen, so phones/emails are never stored
 *  as new schema fields; they are re-derived here from tel_links + the
 *  visible_text the extractor already embeds (including the "Contact
 *  email(s) found on site: ..." line collectEmailsFromHtml folds in). Pure —
 *  exported for tests. */
export function extractContactSignals(evidence: WebsiteEvidence): ContactSignals {
  const joinedText = evidence.visible_text.map((s) => s.text).join(" ");

  const phonesFromTel = evidence.tel_links.map((href) => href.replace(/^tel:/i, "").trim());
  const phonesFromText = [...joinedText.matchAll(new RegExp(PHONE_PATTERN.source, "g"))].map((m) =>
    m[0].trim()
  );
  const phones = dedupPreserveOrder([...phonesFromTel, ...phonesFromText]).slice(0, MAX_CONTACT_MATCHES);

  const emails = dedupPreserveOrder(
    [...joinedText.matchAll(new RegExp(EMAIL_PATTERN.source, "gi"))].map((m) => m[0].trim())
  ).slice(0, MAX_CONTACT_MATCHES);

  return {
    phones,
    emails,
    has_impressum: evidence.has_impressum,
    has_datenschutz: evidence.has_datenschutz,
  };
}

/** ISS-025 — stamps the machine-extracted contact signals onto the evidence
 *  itself so they survive into `audits.evidence_json` instead of only reaching
 *  the Copy Strategist prompt. Applied once, at the point the orchestrator has
 *  a FINAL `WebsiteEvidence` (direct fetch + subpage merge, Tavily fallback, or
 *  rendered-DOM extraction all funnel through the same place), so no extraction
 *  path can be forgotten. Pure — same input, same output, no I/O. */
export function withContactSignals(evidence: WebsiteEvidence): WebsiteEvidence {
  const signals = extractContactSignals(evidence);
  return { ...evidence, contact_phones: signals.phones, contact_emails: signals.emails };
}

function buildWebsiteFallbackFromTavily(rawContent: string, url: string): WebsiteEvidence {
  const text = rawContent.replace(/\s+/g, " ").trim().slice(0, VISIBLE_TEXT_CAP);
  const lower = text.toLowerCase();

  return {
    source: "tavily",
    https: url.startsWith("https://"),
    title: null,
    h1: null,
    meta_description: null,
    has_viewport_meta: false,
    tel_links: [],
    visible_text: chunkTextIntoHeroSections(text, VISIBLE_TEXT_CAP),
    nav_links: [],
    has_impressum: lower.includes("impressum"),
    has_datenschutz: lower.includes("datenschutz") || lower.includes("privacy"),
    img_candidates: [],
  };
}

export interface WebsiteEvidenceResult {
  evidence: WebsiteEvidence;
  // ISS-014: per-image source-page provenance, keyed by normalized src. Empty
  // for the Tavily fallback (which surfaces no images).
  imageSources: ImageSourceMap;
}

/** Fetch -> cheerio -> (too thin or fetch failed) -> Tavily Extract ->
 *  both fail -> null (F-020/F-021/F-022). Never throws. Returns the merged
 *  evidence together with a per-image source-page map (ISS-014). */
export async function fetchWebsiteEvidence(url: string): Promise<WebsiteEvidenceResult | null> {
  const html = await tryFetchHtml(url);
  if (html) {
    const evidence = extractWebsiteEvidenceFromHtml(html, url);
    if (!isEvidenceTooThin(evidence.visible_text)) {
      // ISS-003: fold in Kontakt/Impressum/Leistungen-style subpages, plus
      // ISS-014 Bildergalerie/Referenzen/Projekte pages — real small-business
      // sites routinely keep phone/email/legal AND their real work photos off
      // the homepage.
      const subpages = await crawlPrioritySubpages(evidence.nav_links);
      const imageSources: ImageSourceMap = new Map();
      addImageSources(imageSources, evidence.img_candidates, url);
      for (const { url: subUrl, html: subHtml } of subpages) {
        addImageSources(imageSources, extractImgCandidatesFromHtml(subHtml, subUrl), subUrl);
      }
      return { evidence: mergeSubpageEvidence(evidence, subpages), imageSources };
    }
  }

  const extracted = await tavilyExtract(url);
  if (extracted) {
    return { evidence: buildWebsiteFallbackFromTavily(extracted.raw_content, url), imageSources: new Map() };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Portal extraction (F-023)
// ---------------------------------------------------------------------------

// German postal code + city, e.g. "10115 Berlin".
const ADDRESS_PATTERN = /\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß\-]+(?:\s[A-ZÄÖÜ][a-zäöüß\-]+)*/;

function extractPhoneFromText(text: string): string | undefined {
  const match = text.match(PHONE_PATTERN);
  return match ? match[0].trim() : undefined;
}

function extractGermanAddressFromText(text: string): string | undefined {
  const match = text.match(ADDRESS_PATTERN);
  return match ? match[0].trim() : undefined;
}

/** Cheerio extraction of a portal page into PortalEvidence
 *  (`source: "fetched"`). Pure and network-free — exported for tests. */
export function extractPortalEvidenceFromHtml(
  html: string,
  url: string,
  platform: PortalPlatform
): PortalEvidence {
  const $ = cheerio.load(html);
  const visibleText = $("body").text().replace(/\s+/g, " ").trim().slice(0, VISIBLE_TEXT_CAP);

  const telHref = $('a[href^="tel:"]').first().attr("href");
  const phone = telHref ? telHref.replace(/^tel:/, "").trim() : extractPhoneFromText(visibleText);

  const addressTagText = $("address").first().text().replace(/\s+/g, " ").trim();
  const address = addressTagText || extractGermanAddressFromText(visibleText);

  const brandName = $("h1").first().text().trim() || $("title").first().text().trim() || undefined;

  return {
    platform,
    url,
    source: "fetched",
    visible_text: visibleText,
    ...(brandName ? { brand_name: brandName } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
  };
}

function isPortalTooThin(visibleText: string): boolean {
  return visibleText.length < PORTAL_THIN_THRESHOLD;
}

function buildPortalFallbackFromTavily(
  rawContent: string,
  url: string,
  platform: PortalPlatform
): PortalEvidence {
  const text = rawContent.replace(/\s+/g, " ").trim().slice(0, VISIBLE_TEXT_CAP);
  const phone = extractPhoneFromText(text);
  const address = extractGermanAddressFromText(text);

  return {
    platform,
    url,
    source: "tavily",
    visible_text: text,
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
  };
}

/** Same fetch -> cheerio -> Tavily Extract fallback ladder as
 *  fetchWebsiteEvidence, applied to a directory/portal URL. Read-only —
 *  never posts to or modifies the portal page. */
export async function fetchPortalEvidence(
  url: string,
  platform: PortalPlatform
): Promise<PortalEvidence | null> {
  const html = await tryFetchHtml(url);
  if (html) {
    const evidence = extractPortalEvidenceFromHtml(html, url, platform);
    if (!isPortalTooThin(evidence.visible_text)) {
      return evidence;
    }
  }

  const extracted = await tavilyExtract(url);
  if (extracted) {
    return buildPortalFallbackFromTavily(extracted.raw_content, url, platform);
  }

  return null;
}
