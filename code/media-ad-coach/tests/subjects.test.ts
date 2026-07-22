// ISS-038 regression guards: gallery fillers must always find four DIFFERENT,
// business-relevant subjects — and must never take scraped navigation debris as
// the subject of a generated image. The real strings below come from audit
// 7a395962's derived services.
import { describe, expect, it } from "vitest";
import { isUsableSubject, pickFillerSubjects } from "../lib/images/subjects";

describe("subject sanitation (ISS-038)", () => {
  it("THE BUG: rejects the real scraped debris that reached the image prompts", () => {
    expect(isUsableSubject("Küchenentlüftungen     BAD")).toBe(false); // collapsed layout run
    expect(isUsableSubject("SANITÄRINSTALLATIONEN  Sanitärinstallationen im Alt")).toBe(false);
    expect(isUsableSubject("SANITÄRINSTALLATIONENSanitärinstallationen im Alt")).toBe(false); // glued
    expect(isUsableSubject("Erneuerung Ihrer Heizungsanlage LÜFTUNGSTECHNIKInstallation von Bad")).toBe(false);
    expect(isUsableSubject("Küchenentlüftungen BAD")).toBe(false); // shouted trailing token
  });

  it("keeps service names a human would actually say", () => {
    expect(isUsableSubject("Badsanierung")).toBe(true);
    expect(isUsableSubject("Heizungsinstallation")).toBe(true);
    expect(isUsableSubject("Rohrreinigung im Altbau")).toBe(true);
  });

  it("rejects fragments cut off mid-phrase and non-strings", () => {
    expect(isUsableSubject("Installation von")).toBe(false);
    expect(isUsableSubject("ab")).toBe(false);
    expect(isUsableSubject(null)).toBe(false);
    expect(isUsableSubject("x".repeat(80))).toBe(false);
  });
});

describe("filler subject picking (ISS-038)", () => {
  it("THE FIX: always finds enough distinct subjects, even with zero usable services", () => {
    const picks = pickFillerSubjects({ trade: "plumber", services: [], count: 4, used: new Set(), claimed: new Set() });

    expect(picks).toHaveLength(4);
    expect(new Set(picks.map((p) => p.subject.toLowerCase())).size).toBe(4);
    // Business-relevant: every library subject names something from the trade.
    expect(picks.every((p) => p.subject.length > 10)).toBe(true);
  });

  it("prefers the business's own usable service names, then the library", () => {
    const picks = pickFillerSubjects({
      trade: "plumber",
      services: ["Badsanierung", "SANITÄR   debris"],
      count: 3,
      used: new Set(),
      claimed: new Set(),
    });

    expect(picks[0]!.subject).toBe("Badsanierung");
    expect(picks.some((p) => p.subject.includes("SANITÄR"))).toBe(false);
    expect(picks).toHaveLength(3);
  });

  it("never repeats a subject already used on the page", () => {
    const first = pickFillerSubjects({ trade: "plumber", services: [], count: 2, used: new Set(), claimed: new Set() });
    const second = pickFillerSubjects({
      trade: "plumber",
      services: [],
      count: 2,
      used: new Set(first.map((p) => p.subject.toLowerCase())),
      claimed: new Set(),
    });

    for (const pick of second) {
      expect(first.map((p) => p.subject)).not.toContain(pick.subject);
    }
  });

  it("prefers categories the page has not claimed yet", () => {
    const picks = pickFillerSubjects({
      trade: "plumber",
      services: [],
      count: 2,
      used: new Set(),
      claimed: new Set(["work_result"]),
    });

    expect(picks.some((p) => p.category !== "work_result")).toBe(true);
  });

  it("covers every trade with its own relevant material", () => {
    for (const trade of ["plumber", "electrician", "roofing", "handyman", "doctor", "other"] as const) {
      const picks = pickFillerSubjects({ trade, services: [], count: 4, used: new Set(), claimed: new Set() });
      expect(picks, trade).toHaveLength(4);
      expect(new Set(picks.map((p) => p.subject)).size, trade).toBe(4);
    }
  });
});
