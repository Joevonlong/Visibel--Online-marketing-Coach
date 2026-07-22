// FEA-116 guard: the generated site must always say whose site it is, without
// the name breaking the layout. The After page is often rendered into a ~50%-
// wide split pane, and German trade names run from "Rohrfuchs" to
// "M. Mustermann Sanitär- und Heizungstechnik GmbH & Co. KG".
import { describe, expect, it } from "vitest";

import { heroBrandNameClass, resolveBrandName } from "../components/preview/brandName";
import { cn } from "../lib/utils";

describe("FEA-116 — brand name never gets faked", () => {
  it("returns null rather than inventing a placeholder", () => {
    for (const input of [null, undefined, "", "   ", 42, {}]) {
      expect(resolveBrandName(input)).toBeNull();
    }
  });

  it("trims what it is given", () => {
    expect(resolveBrandName("  Muster + Sohn GmbH  ")).toBe("Muster + Sohn GmbH");
  });
});

describe("FEA-116 — hero sizing scales with the name", () => {
  it("gives a short name the full display treatment", () => {
    expect(heroBrandNameClass("Rohrfuchs")).toContain("4.5rem");
  });

  it("steps down for a medium name", () => {
    const cls = heroBrandNameClass("Muster + Sohn GmbH Berlin");
    expect(cls).toContain("3.5rem");
    expect(cls).not.toContain("4.5rem");
  });

  it("steps down again for a long one instead of wrapping it three times", () => {
    const cls = heroBrandNameClass("M. Mustermann Sanitär- und Heizungstechnik GmbH & Co. KG");
    expect(cls).toContain("2.75rem");
  });

  it("always keeps a responsive clamp, never a fixed size", () => {
    for (const name of ["A", "Muster + Sohn GmbH", "x".repeat(80)]) {
      expect(heroBrandNameClass(name)).toMatch(/^text-\[clamp\(/);
    }
  });

  it("is stable across surrounding whitespace", () => {
    expect(heroBrandNameClass("  Rohrfuchs  ")).toBe(heroBrandNameClass("Rohrfuchs"));
  });
});

describe("FEA-116 — the tailwind-merge ordering trap", () => {
  it("keeps the display line-height when the size class comes FIRST", () => {
    // twMerge treats `text-[clamp(...)]` as the font-size/line-height
    // shorthand, so a `leading-*` written BEFORE it is silently dropped — the
    // hero rendered at 1.5 line-height until this order was fixed. If someone
    // reorders the cn() arguments, this fails instead of quietly regressing.
    const composed = cn(heroBrandNameClass("Rohrfuchs"), "leading-[0.95] font-semibold");
    expect(composed).toContain("leading-[0.95]");

    const wrongOrder = cn("leading-[0.95] font-semibold", heroBrandNameClass("Rohrfuchs"));
    expect(wrongOrder).not.toContain("leading-[0.95]");
  });
});
