// ISS-036 regression guards: raw scraped text and internal form scaffolding
// must never reach the optimized page's cards, and card copy stays bounded so
// the layout holds. The defect: a 641-character "Get in touch" card that began
// "Business type: Plumber." and continued with the customer's whole homepage.
import { describe, expect, it } from "vitest";
import {
  ABOUT_TEXT_MAX,
  lastSentenceEnd,
  boundCardBody,
  boundCardTitle,
  boundText,
  CARD_BODY_MAX,
  CARD_TITLE_MAX,
  looksLikeRawDocument,
  stripInternalScaffolding,
  usableFallbackBody,
} from "../lib/improve/cardCopy";

/** The exact string that shipped on the After page (audit db3aeca0), trimmed. */
const REAL_DEFECT_TEXT =
  "Business type: Plumber. Heizung Lüftung Sanitär - Meisterbetrieb   Als Meisterbetrieb mit langjähriger Erfahrung sind wir  der kompetente Partner rund um Ihre Haustechnik.      Zu unseren Leistungen zählen:  HEIZUNGSTECHNIK Modernisierung und Erneuerung Ihrer Heizungsanlage, Wartung und Reparatur, Brennwerttechnik, Solarthermie und Wärmepumpen für Ihr Zuhause.";

describe("internal scaffolding (ISS-036)", () => {
  it("strips the form's composed 'Business type: …' prefix", () => {
    expect(stripInternalScaffolding(REAL_DEFECT_TEXT).startsWith("Business type")).toBe(false);
    expect(stripInternalScaffolding("Business type: Plumber. Wir helfen schnell.")).toBe("Wir helfen schnell.");
  });

  it("normalizes the whitespace scraped text arrives with", () => {
    expect(stripInternalScaffolding("Heizung   Lüftung\n\nSanitär")).toBe("Heizung Lüftung Sanitär");
  });

  it("recognizes text that is still a document, not card copy", () => {
    expect(looksLikeRawDocument(REAL_DEFECT_TEXT)).toBe(true);
    expect(looksLikeRawDocument("Sanitärarbeiten und Reparaturen in Berlin. Fragen Sie uns.")).toBe(false);
  });
});

describe("bounded card copy (ISS-036)", () => {
  it("THE BUG: the real defect text never becomes a card body", () => {
    const fallback = usableFallbackBody(REAL_DEFECT_TEXT);
    if (fallback !== null) {
      expect(fallback.length).toBeLessThanOrEqual(CARD_BODY_MAX);
      expect(fallback).not.toContain("Business type");
      expect(fallback).not.toContain("HEIZUNGSTECHNIK");
    }
  });

  it("keeps titles and bodies inside their limits", () => {
    expect(boundCardTitle("Heizungsmodernisierung, Wartung und Reparatur für Ihr ganzes Zuhause").length).toBeLessThanOrEqual(
      CARD_TITLE_MAX,
    );
    expect(boundCardBody(REAL_DEFECT_TEXT).length).toBeLessThanOrEqual(CARD_BODY_MAX);
    expect(boundText("x".repeat(2000), ABOUT_TEXT_MAX).length).toBeLessThanOrEqual(ABOUT_TEXT_MAX);
  });

  it("leaves already-short copy exactly as written", () => {
    const copy = "Sanitärarbeiten und Reparaturen in Berlin.";
    expect(boundCardBody(copy)).toBe(copy);
  });

  it("truncates at a sentence boundary, never mid-word", () => {
    const text = "Wir installieren Bäder in Berlin. Wir warten Heizungen zuverlässig. Wir reinigen Rohre schnell und sauber. Und noch viel mehr dazu.";
    const bounded = boundText(text, 70);
    expect(bounded.endsWith(".")).toBe(true);
    expect(bounded.length).toBeLessThanOrEqual(70);
    expect(text.startsWith(bounded)).toBe(true);
  });

  it("returns nothing rather than publishing an excerpt of a wall of text", () => {
    const wall = `${"Sehr lange Firmengeschichte ohne Punkt ".repeat(20)}`;
    expect(usableFallbackBody(wall)).toBeNull();
    expect(usableFallbackBody(null)).toBeNull();
    expect(usableFallbackBody("   ")).toBeNull();
  });
});

describe("sentence boundaries (ISS-036)", () => {
  it("THE FLAW FOUND IN VERIFICATION: never splits on an initial or abbreviation", () => {
    // The real page rendered "…bieten wir als M." — cut at the owner's initial.
    const text = "Seit über 75 Jahren bieten wir als M. Mustermann Sanitärinstallation individuelle Lösungen an. Wir betreuen Sie persönlich.";
    const end = lastSentenceEnd(text, 110);
    expect(text.slice(0, end).endsWith("individuelle Lösungen an.")).toBe(true);
    expect(boundText(text, 110)).not.toMatch(/als M\.$/);
  });

  it("still ends at a genuine sentence end", () => {
    expect(lastSentenceEnd("Erste Sache. Zweite Sache.", 100)).toBe(26);
    expect(lastSentenceEnd("Kein Satzende hier", 100)).toBe(-1);
  });

  it("does not split on common German/English abbreviations", () => {
    const text = "Wir arbeiten u. a. mit Wärmepumpen und Solarthermie zusammen. Rufen Sie an.";
    expect(text.slice(0, lastSentenceEnd(text, 62)).endsWith("zusammen.")).toBe(true);
  });
});
