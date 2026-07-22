// ISS-041 regression guard — a `storefront` image must be recognizably THIS
// trade's working base.
//
// THE BUG: a plumber's storefront shot came back as an anonymous residential
// front door — photorealistic, single-scene, and commercially worthless. The
// prompt asked for "the premises or branded vehicle … tidy, welcoming", which
// describes any building in Germany. Signage and logos are forbidden (no-text
// rule, and invented branding would be a lie), so the only honest way for a
// picture to say "plumber" is the trade's own visible equipment.
import { describe, expect, it } from "vitest";

import { buildImageGenPrompt, type ImageGroundingContext } from "../lib/agents/prompts";
import { pickFillerSubjects } from "../lib/images/subjects";
import type { Trade } from "../lib/schemas";

const TRADES: Trade[] = ["plumber", "electrician", "roofing", "handyman", "doctor", "other"];

const BUSINESS = {
  plumber: { brand_name: "MUSTER + SOHN GmbH", city: "Berlin", services: ["Badsanierung", "Heizungsinstallation"] },
  electrician: { brand_name: "Elektro Nord", city: "Hamburg", services: ["Zählerschrank"] },
  roofing: { brand_name: "Dach Meier", city: "Köln", services: ["Dachsanierung"] },
  handyman: { brand_name: "Hausmeister Klein", city: "Essen", services: ["Türreparatur"] },
  doctor: { brand_name: "Praxis Dr. Schmidt", city: "Berlin", services: ["Vorsorge"] },
  other: { brand_name: "Café Löwenzahn", city: "Berlin", services: ["latte art"] },
} satisfies Record<Trade, ImageGroundingContext>;

/** The concrete objects each trade's premises shot must put in frame. */
const REQUIRED_CUES: Record<Trade, RegExp> = {
  plumber: /pipe|fittings|valves|tool cases/i,
  electrician: /cable|conduit|test gear|consumer units/i,
  roofing: /tiles|ladders|battens|harness/i,
  handyman: /toolbox|timber|ladder|power tools/i,
  doctor: /practice entrance|reception/i,
  other: /equipment|stock|work vehicle/i,
};

describe("ISS-041 — storefront prompts are grounded in the trade", () => {
  it("THE BUG: no storefront prompt is a content-free 'tidy, welcoming premises' brief", () => {
    for (const trade of TRADES) {
      const prompt = buildImageGenPrompt(trade, "storefront", BUSINESS[trade]);
      expect(prompt).not.toContain("the premises or branded vehicle of");
      expect(prompt).not.toContain("tidy, welcoming and unmistakably in business");
    }
  });

  it("THE FIX: every trade's storefront prompt names that trade's own visible equipment", () => {
    for (const trade of TRADES) {
      const prompt = buildImageGenPrompt(trade, "storefront", BUSINESS[trade]);
      expect(prompt, `${trade} storefront prompt has no trade cue`).toMatch(REQUIRED_CUES[trade]);
    }
  });

  it("explicitly rules out the anonymous house/office frame that was generated", () => {
    const prompt = buildImageGenPrompt("plumber", "storefront", BUSINESS.plumber);
    expect(prompt).toContain("never to an anonymous house or office");
    expect(prompt).toContain("Never an anonymous residential front door");
    // …while the ISS-039 single-scene rule survives untouched.
    expect(prompt).toContain("ONE single photographic scene only");
  });

  it("a subject-anchored storefront filler stays grounded too", () => {
    // This is the gallery-filler path: the subject comes from the library, and
    // the trade cue must still be attached to it.
    const prompt = buildImageGenPrompt("plumber", "storefront", BUSINESS.plumber, "the inside of a service van stocked with copper pipe, fittings and tool cases");
    expect(prompt).toMatch(REQUIRED_CUES.plumber);
    expect(prompt).toContain("the working base of MUSTER + SOHN GmbH");
  });

  it("the filler subject library has no content-free storefront entry left", () => {
    for (const trade of TRADES) {
      const picks = pickFillerSubjects({ trade, services: [], count: 8, used: new Set(), claimed: new Set() });
      for (const pick of picks.filter((p) => p.category === "storefront")) {
        expect(pick.subject, `${trade}: "${pick.subject}" says nothing about the business`).not.toMatch(
          /^(the business premises, tidy and welcoming|the inside of a fully stocked service van)$/,
        );
        expect(pick.subject.length).toBeGreaterThan(20);
      }
    }
  });
});
