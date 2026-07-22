// Deterministic tests for lib/pipeline/{website,tavily,images}.ts (F-020..F-023,
// F-026, F-028, F-029). No network calls — every pure/extraction function under
// test is exported specifically so it can be exercised against inline fixtures.
import { describe, expect, it } from "vitest";
import type { ImgCandidate, WebsiteEvidence } from "../lib/schemas";
import {
  classifySubpageSection,
  collectEmailsFromHtml,
  collectSameDomainLinks,
  detectPlatform,
  extractContactSignals,
  extractImgCandidatesFromHtml,
  extractPortalEvidenceFromHtml,
  extractWebsiteEvidenceFromHtml,
  imageSourcesForSinglePage,
  isEvidenceTooThin,
  mergeSubpageEvidence,
  selectImageGalleryLinks,
  selectPriorityLinks,
  withContactSignals,
} from "../lib/pipeline/website";
import { filterImageCandidates, isLogoScaleImage } from "../lib/pipeline/images";
import { classifyFindability } from "../lib/pipeline/tavily";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLUMBER_HTML = `
<!DOCTYPE html>
<html lang="de">
<head>
  <title>Sanitär Krause</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Sanitär Krause Berlin" />
</head>
<body>
  <nav>
    <a href="#about">Über uns</a>
    <a href="/impressum">Impressum</a>
  </nav>
  <h1>Sanitär Krause</h1>
  <p>Wir sind ein Familienbetrieb seit 1998 und kümmern uns um Ihre Heizung und Ihr Bad in ganz Berlin.</p>
  <h2>Über uns</h2>
  <p>Wir bieten Heizungsinstallation, Badsanierung und professionelle Rohrreinigung für Privat- und Gewerbekunden im gesamten Stadtgebiet an.</p>
  <img src="/images/team.jpg" alt="Team photo" width="800" height="600" />
  <img src="/images/logo.svg" alt="Logo" />
  <footer>
    <a href="tel:+493012345678">030 12345678</a>
    <a href="/impressum">Impressum</a>
    <a href="/datenschutz">Datenschutz</a>
  </footer>
</body>
</html>
`;

const JS_SHELL_HTML = `
<!DOCTYPE html>
<html>
<head><title>App</title></head>
<body>
  <div id="root"></div>
  <script src="/static/app.js"></script>
</body>
</html>
`;

// Replicates a real, confirmed-live extractor gap observed on a page-builder
// site during target scouting (name withheld). Page-builder markup nests the <h1>
// alone in a wrapper div with zero sibling text, while the real copy lives
// several divs deeper, unconnected to any heading by direct sibling walk —
// exactly the shape that made the live extractor read a genuine 59KB, 200-OK
// page as ~197 chars and fall through to "unreachable".
const DEEP_NESTED_COPY_HTML = `
<!DOCTYPE html>
<html lang="de">
<head><title>Q7W Facility Service</title></head>
<body>
  <header>
    <div class="hero-wrap">
      <div class="hero-inner">
        <h1>Hausmeisterdienst in Berlin</h1>
      </div>
    </div>
  </header>
  <section class="content">
    <div class="row">
      <div class="col">
        <div class="text-block">
          <p>Sie brauchen einen Hausmeisterservice in Berlin, der Reparaturen und Pflegearbeiten an Ihrer Wohn- oder Gewerbeimmobilie verlaesslich uebernimmt? Unser fiktives Musterteam erledigt Kleinreparaturen, Gartenpflege und Treppenhausreinigung fuer Privat- und Gewerbekunden im gesamten Stadtgebiet, stets puenktlich, sorgfaeltig und mit einem festen Ansprechpartner fuer jeden Auftrag, damit Qualitaet und Zufriedenheit nie dem Zufall ueberlassen bleiben.</p>
        </div>
      </div>
    </div>
  </section>
  <nav>
    <a href="/impressum">Impressum</a>
  </nav>
</body>
</html>
`;

const PORTAL_WITH_TAGS_HTML = `
<!DOCTYPE html>
<html>
<head><title>Sanitär Krause Berlin - Gelbe Seiten</title></head>
<body>
  <h1>Sanitär Krause Berlin</h1>
  <p>Bad- und Heizungsinstallation, Rohrreinigung. Bewertung: 3.6 von 5 Sternen bei 14 Bewertungen.</p>
  <address>Musterstraße 12, 10115 Berlin</address>
  <a href="tel:+493012345678">030 12345678</a>
</body>
</html>
`;

const PORTAL_NO_TAGS_HTML = `
<!DOCTYPE html>
<html>
<head><title>Handwerker Schmidt - Check24</title></head>
<body>
  <h1>Handwerker Schmidt</h1>
  <p>Elektroinstallation und Reparaturen. Rufen Sie uns an unter 0176 12345678 oder besuchen Sie uns in der Hauptstraße 5, 80331 München.</p>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Website extraction
// ---------------------------------------------------------------------------

describe("extractWebsiteEvidenceFromHtml — realistic weak plumber page", () => {
  const evidence = extractWebsiteEvidenceFromHtml(
    PLUMBER_HTML,
    "https://www.sanitaer-krause-berlin.de"
  );

  it("extracts head + meta fields", () => {
    expect(evidence.source).toBe("fetched");
    expect(evidence.https).toBe(true);
    expect(evidence.title).toBe("Sanitär Krause");
    expect(evidence.h1).toBe("Sanitär Krause");
    expect(evidence.meta_description).toBe("Sanitär Krause Berlin");
    expect(evidence.has_viewport_meta).toBe(true);
  });

  it("extracts tel: links", () => {
    expect(evidence.tel_links).toEqual(["tel:+493012345678"]);
  });

  it("flags impressum and datenschutz presence", () => {
    expect(evidence.has_impressum).toBe(true);
    expect(evidence.has_datenschutz).toBe(true);
  });

  it("section-tags visible text into hero/about/footer", () => {
    const hero = evidence.visible_text.find((s) => s.section === "hero");
    const about = evidence.visible_text.find((s) => s.section === "about");
    const footer = evidence.visible_text.find((s) => s.section === "footer");

    expect(hero?.text).toContain("Sanitär Krause");
    expect(hero?.text).toContain("Familienbetrieb");
    expect(about?.text).toContain("Über uns");
    expect(about?.text).toContain("Rohrreinigung");
    expect(footer?.text).toContain("Impressum");
  });

  it("collects img candidates with absolute src and natural_size when attrs present", () => {
    const team = evidence.img_candidates.find((c) => c.src.includes("team.jpg"));
    const logo = evidence.img_candidates.find((c) => c.src.includes("logo.svg"));

    expect(team?.src).toBe("https://www.sanitaer-krause-berlin.de/images/team.jpg");
    expect(team?.alt).toBe("Team photo");
    expect(team?.natural_size).toEqual({ width: 800, height: 600 });

    expect(logo).toBeDefined();
    expect(logo?.natural_size).toBeUndefined();
  });

  it("is not classified as too thin", () => {
    expect(isEvidenceTooThin(evidence.visible_text)).toBe(false);
  });
});

describe("extractWebsiteEvidenceFromHtml — JS-shell page", () => {
  it("produces near-empty visible_text that triggers the too-thin fallback path", () => {
    const evidence = extractWebsiteEvidenceFromHtml(JS_SHELL_HTML, "https://shell.example.test");
    expect(evidence.visible_text).toEqual([]);
    expect(isEvidenceTooThin(evidence.visible_text)).toBe(true);
  });
});

describe("extractWebsiteEvidenceFromHtml — real copy nested deeper than the heading sibling-walk", () => {
  it("rescues body-level text instead of misreading a real page as too thin", () => {
    const evidence = extractWebsiteEvidenceFromHtml(
      DEEP_NESTED_COPY_HTML,
      "https://q7w-example.test"
    );
    const total = evidence.visible_text.reduce((sum, s) => sum + s.text.length, 0);

    expect(evidence.source).toBe("fetched");
    expect(total).toBeGreaterThan(200);
    expect(isEvidenceTooThin(evidence.visible_text)).toBe(false);

    const joined = evidence.visible_text.map((s) => s.text).join(" ");
    expect(joined).toContain("Hausmeisterservice");
    expect(joined).toContain("Kleinreparaturen");
    // nav is stripped before the rescue pass — its link text must not leak in.
    expect(joined).not.toContain("Impressum");
  });
});

// ---------------------------------------------------------------------------
// ISS-003/ISS-004 — same-domain link collection, subpage crawl selection,
// subpage evidence merge, and email extraction (all pure, network-free)
// ---------------------------------------------------------------------------

const LINKS_HTML = `
<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
  <header>
    <a href="/">Home</a>
    <a href="/kontakt">Kontakt</a>
    <a href="/impressum">Impressum</a>
    <a href="/datenschutz">Datenschutz</a>
    <a href="/leistungen">Leistungen</a>
    <a href="/ueber-uns">Über uns</a>
    <a href="/blog">Blog</a>
    <a href="#top">Back to top</a>
    <a href="mailto:info@example-test.de">Email us</a>
    <a href="tel:+493012345678">Call</a>
    <a href="javascript:void(0)">Menu</a>
    <a href="https://www.facebook.com/example">Facebook</a>
    <a href="/kontakt">Kontakt (duplicate)</a>
  </header>
</body>
</html>
`;

describe("collectSameDomainLinks", () => {
  it("resolves every <a href> (not just <nav> a), drops #/mailto:/tel:/javascript:/cross-domain, dedupes", () => {
    const links = collectSameDomainLinks(LINKS_HTML, "https://www.example-test.de");

    expect(links).toEqual([
      "https://www.example-test.de/",
      "https://www.example-test.de/kontakt",
      "https://www.example-test.de/impressum",
      "https://www.example-test.de/datenschutz",
      "https://www.example-test.de/leistungen",
      "https://www.example-test.de/ueber-uns",
      "https://www.example-test.de/blog",
    ]);
  });

  it("caps the collected link set at 40", () => {
    const manyLinks = Array.from({ length: 60 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join("\n");
    const html = `<!DOCTYPE html><html><body>${manyLinks}</body></html>`;

    const links = collectSameDomainLinks(html, "https://www.example-test.de");
    expect(links).toHaveLength(40);
  });
});

describe("selectPriorityLinks", () => {
  const links = [
    "https://www.example-test.de/",
    "https://www.example-test.de/blog",
    "https://www.example-test.de/kontakt",
    "https://www.example-test.de/impressum",
    "https://www.example-test.de/datenschutz",
    "https://www.example-test.de/leistungen",
    "https://www.example-test.de/ueber-uns",
    "https://www.example-test.de/team",
    "https://www.example-test.de/referenzen",
  ];

  it("keeps only keyword-matching links, in discovery order, dropping non-matches like / and /blog", () => {
    const selected = selectPriorityLinks(links, 10);
    expect(selected).toEqual([
      "https://www.example-test.de/kontakt",
      "https://www.example-test.de/impressum",
      "https://www.example-test.de/datenschutz",
      "https://www.example-test.de/leistungen",
      "https://www.example-test.de/ueber-uns",
      "https://www.example-test.de/team",
      "https://www.example-test.de/referenzen",
    ]);
  });

  it("caps at the default of 5", () => {
    const selected = selectPriorityLinks(links);
    expect(selected).toHaveLength(5);
    expect(selected).toEqual([
      "https://www.example-test.de/kontakt",
      "https://www.example-test.de/impressum",
      "https://www.example-test.de/datenschutz",
      "https://www.example-test.de/leistungen",
      "https://www.example-test.de/ueber-uns",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(selectPriorityLinks(["https://www.example-test.de/", "https://www.example-test.de/blog"])).toEqual([]);
  });
});

describe("classifySubpageSection", () => {
  it("tags Kontakt/Impressum/Datenschutz pages as footer", () => {
    expect(classifySubpageSection("https://x.test/kontakt")).toBe("footer");
    expect(classifySubpageSection("https://x.test/impressum")).toBe("footer");
    expect(classifySubpageSection("https://x.test/datenschutz")).toBe("footer");
    expect(classifySubpageSection("https://x.test/contact")).toBe("footer");
  });

  it("tags Leistungen/Angebot/Service pages as services", () => {
    expect(classifySubpageSection("https://x.test/leistungen")).toBe("services");
    expect(classifySubpageSection("https://x.test/angebot")).toBe("services");
    expect(classifySubpageSection("https://x.test/service")).toBe("services");
  });

  it("falls back to about for everything else (über-uns/team/referenzen/unknown)", () => {
    expect(classifySubpageSection("https://x.test/ueber-uns")).toBe("about");
    expect(classifySubpageSection("https://x.test/team")).toBe("about");
    expect(classifySubpageSection("https://x.test/referenzen")).toBe("about");
    expect(classifySubpageSection("https://x.test/random-page")).toBe("about");
  });
});

const MAILTO_AND_TEXT_EMAIL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Kontakt</title></head>
<body>
  <p>Schreiben Sie uns: Info@Sanitaer-Krause.de oder rufen Sie an.</p>
  <a href="mailto:kontakt@sanitaer-krause.de?subject=Anfrage">Kontakt</a>
  <script>var fake = "notreal@example.com";</script>
</body>
</html>
`;

describe("collectEmailsFromHtml", () => {
  it("collects mailto: href addresses (query stripped) plus emails found in visible text, deduped", () => {
    const emails = collectEmailsFromHtml(MAILTO_AND_TEXT_EMAIL_HTML);
    expect(emails).toEqual(["kontakt@sanitaer-krause.de", "Info@Sanitaer-Krause.de"]);
  });

  it("does not pick up emails that only exist inside <script>", () => {
    const emails = collectEmailsFromHtml(MAILTO_AND_TEXT_EMAIL_HTML);
    expect(emails).not.toContain("notreal@example.com");
  });

  it("returns an empty array when there is no contact email on the page", () => {
    expect(collectEmailsFromHtml("<html><body><p>No contact info here.</p></body></html>")).toEqual([]);
  });
});

describe("extractWebsiteEvidenceFromHtml — folds discovered emails into a footer visible_text block", () => {
  it("embeds a truthful 'Contact email(s) found on site' line when an email is present", () => {
    const evidence = extractWebsiteEvidenceFromHtml(
      MAILTO_AND_TEXT_EMAIL_HTML,
      "https://www.sanitaer-krause-berlin.de/kontakt"
    );
    const footer = evidence.visible_text.find(
      (s) => s.section === "footer" && s.text.startsWith("Contact email(s) found on site:")
    );
    expect(footer?.text).toContain("kontakt@sanitaer-krause.de");
  });

  it("adds no email footer block when the page has no email", () => {
    const evidence = extractWebsiteEvidenceFromHtml(PLUMBER_HTML, "https://www.sanitaer-krause-berlin.de");
    expect(evidence.visible_text.some((s) => s.text.startsWith("Contact email(s) found on site:"))).toBe(false);
  });
});

const KONTAKT_SUBPAGE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Kontakt</title></head>
<body>
  <h1>Kontakt</h1>
  <p>Rufen Sie uns an oder schreiben Sie eine E-Mail, wir melden uns umgehend zurück.</p>
  <a href="tel:+493019998888">030 9998888</a>
  <a href="mailto:kontakt@sanitaer-krause.de">E-Mail</a>
  <footer><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></footer>
</body>
</html>
`;

const LEISTUNGEN_SUBPAGE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Leistungen</title></head>
<body>
  <h1>Unsere Leistungen</h1>
  <p>Heizungsinstallation, Badsanierung, Rohrreinigung und Notdienst rund um die Uhr für Privat- und Gewerbekunden.</p>
  <img src="/images/work-1.jpg" alt="Rohrreinigung im Einsatz" width="900" height="600" />
</body>
</html>
`;

const MERGE_BASE_EVIDENCE: WebsiteEvidence = {
  source: "fetched",
  https: true,
  title: "Sanitär Krause",
  h1: "Sanitär Krause",
  meta_description: null,
  has_viewport_meta: true,
  tel_links: ["tel:+493012340000"],
  visible_text: [{ section: "hero", text: "Sanitär Krause - Ihr Klempner in Berlin seit 1998." }],
  nav_links: [],
  has_impressum: false,
  has_datenschutz: false,
  img_candidates: [{ src: "https://www.sanitaer-krause-berlin.de/images/hero.jpg", alt: "Hero" }],
};

describe("mergeSubpageEvidence", () => {
  const merged = mergeSubpageEvidence(MERGE_BASE_EVIDENCE, [
    { url: "https://www.sanitaer-krause-berlin.de/kontakt", html: KONTAKT_SUBPAGE_HTML },
    { url: "https://www.sanitaer-krause-berlin.de/leistungen", html: LEISTUNGEN_SUBPAGE_HTML },
  ]);

  it("unions tel_links from every subpage with the homepage's own", () => {
    expect(merged.tel_links).toEqual(
      expect.arrayContaining(["tel:+493012340000", "tel:+493019998888"])
    );
    expect(merged.tel_links).toHaveLength(2);
  });

  it("OR-merges has_impressum/has_datenschutz even though the homepage alone had neither", () => {
    expect(merged.has_impressum).toBe(true);
    expect(merged.has_datenschutz).toBe(true);
  });

  it("merges img candidates, resolved against each subpage's own URL, deduped by normalized URL", () => {
    expect(merged.img_candidates.map((c) => c.src)).toEqual(
      expect.arrayContaining([
        "https://www.sanitaer-krause-berlin.de/images/hero.jpg",
        "https://www.sanitaer-krause-berlin.de/images/work-1.jpg",
      ])
    );
    expect(merged.img_candidates).toHaveLength(2);
  });

  it("keeps the homepage's own per-heading sections untouched and re-tags each subpage into ONE frozen section", () => {
    expect(merged.visible_text[0]).toEqual({
      section: "hero",
      text: "Sanitär Krause - Ihr Klempner in Berlin seit 1998.",
    });

    const footerBlock = merged.visible_text.find(
      (s) => s.section === "footer" && s.text.includes("Rufen Sie uns an")
    );
    expect(footerBlock?.text).toContain("kontakt@sanitaer-krause.de");

    const servicesBlock = merged.visible_text.find(
      (s) => s.section === "services" && s.text.includes("Heizungsinstallation")
    );
    expect(servicesBlock?.text).toContain("Rohrreinigung");
  });

  it("caps a single subpage's text contribution at 2000 chars", () => {
    const longParagraph = "Lorem ipsum dolor sit amet. ".repeat(200); // ~5800 chars
    const longHtml = `<!DOCTYPE html><html><head><title>Über uns</title></head><body><h1>Über uns</h1><p>${longParagraph}</p></body></html>`;

    const mergedLong = mergeSubpageEvidence(
      { ...MERGE_BASE_EVIDENCE, visible_text: [] },
      [{ url: "https://www.sanitaer-krause-berlin.de/ueber-uns", html: longHtml }]
    );

    expect(mergedLong.visible_text).toHaveLength(1);
    expect(mergedLong.visible_text[0].text.length).toBe(2000);
  });

  it("passes through unchanged with an empty subpage list", () => {
    expect(mergeSubpageEvidence(MERGE_BASE_EVIDENCE, [])).toEqual(MERGE_BASE_EVIDENCE);
  });
});

const CONTACT_SIGNALS_EVIDENCE: WebsiteEvidence = {
  source: "fetched",
  https: true,
  title: null,
  h1: null,
  meta_description: null,
  has_viewport_meta: true,
  tel_links: ["tel:+493012345678", "tel:+493012345678"],
  visible_text: [
    { section: "hero", text: "Sanitär Krause Berlin." },
    {
      section: "footer",
      text: "Contact email(s) found on site: kontakt@sanitaer-krause.de, Info@sanitaer-krause.de",
    },
    { section: "about", text: "Alternativ erreichen Sie uns unter 030 87654321." },
  ],
  nav_links: [],
  has_impressum: true,
  has_datenschutz: false,
  img_candidates: [],
};

describe("extractContactSignals", () => {
  it("derives deduped phones from tel_links + visible text, and emails from embedded/plain text", () => {
    const signals = extractContactSignals(CONTACT_SIGNALS_EVIDENCE);

    expect(signals.phones).toEqual(["+493012345678", "030 87654321"]);
    expect(signals.emails).toEqual(
      expect.arrayContaining(["kontakt@sanitaer-krause.de", "Info@sanitaer-krause.de"])
    );
    expect(signals.emails).toHaveLength(2);
  });

  it("passes has_impressum/has_datenschutz straight through from the evidence", () => {
    const signals = extractContactSignals(CONTACT_SIGNALS_EVIDENCE);
    expect(signals.has_impressum).toBe(true);
    expect(signals.has_datenschutz).toBe(false);
  });

  it("returns empty phone/email arrays when there is no contact info at all", () => {
    const signals = extractContactSignals({
      ...CONTACT_SIGNALS_EVIDENCE,
      tel_links: [],
      visible_text: [{ section: "hero", text: "Nothing to see here." }],
    });
    expect(signals.phones).toEqual([]);
    expect(signals.emails).toEqual([]);
  });
});

// ISS-025 regression guard: a page that prints its phone number as plain text
// (no tel: href) must still persist it as evidence. Modeled on a real Berlin
// plumber's site with exactly this shape (identifiers replaced with the
// fictional Muster + Sohn GmbH persona), which was therefore scored as
// "no phone number on the website".
const PLAIN_TEXT_PHONE_HTML = `
<!DOCTYPE html>
<html lang="de">
  <head><title>Muster + Sohn GmbH</title></head>
  <body>
    <h1>Muster + Sohn GmbH</h1>
    <p>Musterstraße 24, 10999 Berlin</p>
    <p>Telefon 030 12345678</p>
    <p>E-Mail: info@muster-sanitaer.example</p>
  </body>
</html>
`;

describe("withContactSignals (ISS-025)", () => {
  it("persists a plain-text phone into contact_phones although tel_links stays empty", () => {
    const base = extractWebsiteEvidenceFromHtml(PLAIN_TEXT_PHONE_HTML, "https://www.muster-sanitaer.example/");
    expect(base.tel_links).toEqual([]);
    expect(base.contact_phones).toBeUndefined();

    const stamped = withContactSignals(base);

    expect(stamped.tel_links).toEqual([]);
    expect(stamped.contact_phones).toContain("030 12345678");
    expect(stamped.contact_emails).toContain("info@muster-sanitaer.example");
  });

  it("emits empty arrays (not absent fields) when nothing was found — 'extracted, found nothing'", () => {
    const stamped = withContactSignals({
      ...CONTACT_SIGNALS_EVIDENCE,
      tel_links: [],
      visible_text: [{ section: "hero", text: "Nothing to see here." }],
    });
    expect(stamped.contact_phones).toEqual([]);
    expect(stamped.contact_emails).toEqual([]);
  });

  it("leaves every pre-existing evidence field untouched (additive only)", () => {
    const stamped = withContactSignals(CONTACT_SIGNALS_EVIDENCE);
    const { contact_phones: _p, contact_emails: _e, ...rest } = stamped;
    expect(rest).toEqual(CONTACT_SIGNALS_EVIDENCE);
  });
});

// ---------------------------------------------------------------------------
// Portal extraction
// ---------------------------------------------------------------------------

describe("extractPortalEvidenceFromHtml — portal page with address/tel tags", () => {
  it("extracts phone via tel: link and address via <address> tag", () => {
    const evidence = extractPortalEvidenceFromHtml(
      PORTAL_WITH_TAGS_HTML,
      "https://www.gelbeseiten.de/gsbiz/sanitaer-krause-berlin",
      "yellow_pages"
    );

    expect(evidence.platform).toBe("yellow_pages");
    expect(evidence.source).toBe("fetched");
    expect(evidence.brand_name).toBe("Sanitär Krause Berlin");
    expect(evidence.phone).toBe("+493012345678");
    expect(evidence.address).toBe("Musterstraße 12, 10115 Berlin");
    expect(evidence.visible_text).toContain("Rohrreinigung");
  });
});

describe("extractPortalEvidenceFromHtml — portal page without tel/address tags", () => {
  it("falls back to regex extraction of phone + German postal address from body text", () => {
    const evidence = extractPortalEvidenceFromHtml(
      PORTAL_NO_TAGS_HTML,
      "https://www.check24.de/handwerker/schmidt",
      "check24"
    );

    expect(evidence.phone).toBe("0176 12345678");
    expect(evidence.address).toBe("80331 München");
  });
});

// ---------------------------------------------------------------------------
// detectPlatform
// ---------------------------------------------------------------------------

describe("detectPlatform", () => {
  it("recognizes Gelbe Seiten as yellow_pages", () => {
    expect(detectPlatform("https://www.gelbeseiten.de/gsbiz/sanitaer-krause-berlin")).toBe(
      "yellow_pages"
    );
  });

  it("recognizes Check24 as check24", () => {
    expect(detectPlatform("https://www.check24.de/handwerker/schmidt")).toBe("check24");
  });

  it("falls back to other for unrecognized platforms", () => {
    expect(detectPlatform("https://www.11880.com/example")).toBe("other");
    expect(detectPlatform("https://www.sanitaer-krause-berlin.de")).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// Image candidate filtering
// ---------------------------------------------------------------------------

describe("filterImageCandidates", () => {
  it("drops icons, svg, declared-favicon-scale images, data URIs, and duplicates; keeps real content images", () => {
    const candidates: ImgCandidate[] = [
      { src: "/images/hero.jpg", alt: "Team at work", natural_size: { width: 1200, height: 800 } },
      { src: "/images/icon-phone.png", alt: null, natural_size: { width: 64, height: 64 } },
      { src: "/images/logo.svg", alt: "Company logo" },
      { src: "data:image/png;base64,AAAA", alt: null },
      {
        src: "/images/hero.jpg?cache=123",
        alt: "Team at work duplicate",
        natural_size: { width: 1200, height: 800 },
      },
      // ISS-014: declares a sub-100px short edge -> favicon-scale, dropped early.
      { src: "/images/badge-strip.jpg", alt: "Badge", natural_size: { width: 300, height: 40 } },
      { src: "/images/work-proof.jpg", alt: "Finished job", natural_size: { width: 900, height: 600 } },
    ];

    const survivors = filterImageCandidates(candidates, "https://example.test/");

    expect(survivors.map((c) => c.src)).toEqual([
      "https://example.test/images/hero.jpg",
      "https://example.test/images/work-proof.jpg",
    ]);
  });

  it("ISS-014: keeps a real small gallery thumbnail (>=100px short edge) that older 200px gating wrongly dropped", () => {
    const candidates: ImgCandidate[] = [
      { src: "/resources/A1.jpg", alt: "Bathroom project", natural_size: { width: 120, height: 120 } },
    ];
    const survivors = filterImageCandidates(candidates, "https://www.muster-sanitaer.example/");
    expect(survivors.map((c) => c.src)).toEqual(["https://www.muster-sanitaer.example/resources/A1.jpg"]);
  });

  it("returns an empty survivor set when every candidate is an icon/logo/sprite", () => {
    const candidates: ImgCandidate[] = [
      { src: "/logo.svg", alt: "Logo" },
      { src: "/sprite-icons.png", alt: null, natural_size: { width: 64, height: 64 } },
    ];
    expect(filterImageCandidates(candidates, "https://example.test/")).toEqual([]);
  });
});

describe("isLogoScaleImage (ISS-014)", () => {
  it("flags the live pilot site's two logos by their true downloaded dimensions", () => {
    expect(isLogoScaleImage(50, 50)).toBe(true); // square logo
    expect(isLogoScaleImage(170, 19)).toBe(true); // wordmark strip
  });

  it("keeps real photos, including small gallery thumbnails", () => {
    expect(isLogoScaleImage(120, 120)).toBe(false); // live pilot gallery thumbnail
    expect(isLogoScaleImage(900, 600)).toBe(false);
    expect(isLogoScaleImage(1024, 768)).toBe(false);
  });

  it("flags a wide banner/wordmark that clears the short-edge floor via aspect ratio", () => {
    expect(isLogoScaleImage(800, 120)).toBe(true); // 6.7:1 strip, short edge < 300
    // a genuine wide work photo with a large short edge is NOT gated
    expect(isLogoScaleImage(1600, 400)).toBe(false); // 4:1 but short edge >= 300
  });

  it("does not gate when dimensions are unknown (caller decides)", () => {
    expect(isLogoScaleImage(null, null)).toBe(false);
    expect(isLogoScaleImage(500, null)).toBe(false);
  });
});

describe("selectImageGalleryLinks (ISS-014)", () => {
  const links = [
    "https://www.muster-sanitaer.example/",
    "https://www.muster-sanitaer.example/kontakt.html",
    "https://www.muster-sanitaer.example/bildergalerie.html",
    "https://www.muster-sanitaer.example/referenzen.html",
    "https://www.muster-sanitaer.example/projekte",
    "https://www.muster-sanitaer.example/portfolio",
    "https://www.muster-sanitaer.example/jobs.html",
  ];

  it("keeps only gallery/portfolio-style links, in discovery order", () => {
    expect(selectImageGalleryLinks(links, 10)).toEqual([
      "https://www.muster-sanitaer.example/bildergalerie.html",
      "https://www.muster-sanitaer.example/referenzen.html",
      "https://www.muster-sanitaer.example/projekte",
      "https://www.muster-sanitaer.example/portfolio",
    ]);
  });

  it("caps at the default of 3", () => {
    expect(selectImageGalleryLinks(links)).toHaveLength(3);
  });

  it("returns an empty array when nothing matches", () => {
    expect(selectImageGalleryLinks(["https://www.muster-sanitaer.example/", "https://www.muster-sanitaer.example/jobs.html"])).toEqual([]);
  });
});

describe("image provenance (ISS-014)", () => {
  const GALLERY_HTML = `<!DOCTYPE html><html><head><title>Bildergalerie</title></head><body>
    <img src="resources/A1.jpg" width="120" height="120">
    <img src="resources/C2.jpg">
    <img src="resources/logo.png"></body></html>`;

  it("extractImgCandidatesFromHtml resolves each src absolute against the page URL", () => {
    const imgs = extractImgCandidatesFromHtml(GALLERY_HTML, "https://www.muster-sanitaer.example/bildergalerie.html");
    expect(imgs.map((c) => c.src)).toEqual([
      "https://www.muster-sanitaer.example/resources/A1.jpg",
      "https://www.muster-sanitaer.example/resources/C2.jpg",
      "https://www.muster-sanitaer.example/resources/logo.png",
    ]);
    expect(imgs[0].natural_size).toEqual({ width: 120, height: 120 });
  });

  it("imageSourcesForSinglePage maps each image's normalized src to its source page", () => {
    const evidence = extractWebsiteEvidenceFromHtml(GALLERY_HTML, "https://www.muster-sanitaer.example/bildergalerie.html");
    const sources = imageSourcesForSinglePage(evidence, "https://www.muster-sanitaer.example/bildergalerie.html");
    expect(sources.get("https://www.muster-sanitaer.example/resources/A1.jpg")).toBe(
      "https://www.muster-sanitaer.example/bildergalerie.html"
    );
    expect(sources.get("https://www.muster-sanitaer.example/resources/C2.jpg")).toBe(
      "https://www.muster-sanitaer.example/bildergalerie.html"
    );
  });
});

// ---------------------------------------------------------------------------
// Findability classification
// ---------------------------------------------------------------------------

describe("classifyFindability", () => {
  const brand = "Sanitär Krause Berlin";

  it("found: brand appears on a non-portal (own) domain", () => {
    const results = [
      { title: "Sanitär Krause Berlin – Ihr Klempner", url: "https://www.sanitaer-krause-berlin.de" },
      { title: "Gelbe Seiten – Klempner in Berlin", url: "https://www.gelbeseiten.de/suche/klempner-berlin" },
    ];
    expect(classifyFindability(results, brand)).toBe("found");
  });

  it("portals_only: brand mentioned only on directory/portal domains", () => {
    const results = [
      {
        title: "Sanitär Krause Berlin – Bewertungen",
        url: "https://www.gelbeseiten.de/gsbiz/sanitaer-krause-berlin",
      },
      { title: "Sanitär Krause auf Check24", url: "https://www.check24.de/handwerker/sanitaer-krause" },
    ];
    expect(classifyFindability(results, brand)).toBe("portals_only");
  });

  it("not_found: brand not mentioned anywhere in the result set", () => {
    const results = [
      { title: "Klempner Notdienst Berlin – Top 10", url: "https://www.gelbeseiten.de/suche/klempner-berlin" },
      { title: "Bester Installateur München", url: "https://www.other-directory.de/muenchen" },
    ];
    expect(classifyFindability(results, brand)).toBe("not_found");
  });

  it("not_found on an empty result set", () => {
    expect(classifyFindability([], brand)).toBe("not_found");
  });
});
