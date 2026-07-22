import { describe, expect, it } from "vitest";

import { assetUrl, deriveAssetRef } from "../lib/client/assets";

describe("assetUrl", () => {
  it("returns null for null input", () => {
    expect(assetUrl(null)).toBeNull();
  });

  it("returns absolute public paths unchanged", () => {
    expect(assetUrl("/fixtures/sanitaer-krause-berlin/web-img-1.jpg")).toBe(
      "/fixtures/sanitaer-krause-berlin/web-img-1.jpg"
    );
  });

  it("strips a leading storage/ prefix", () => {
    expect(assetUrl("storage/uploads/audit-1/photo.jpg")).toBe("/assets/uploads/audit-1/photo.jpg");
  });

  it("prepends /assets/ to a bare relative storage path", () => {
    expect(assetUrl("uploads/audit-1/photo.jpg")).toBe("/assets/uploads/audit-1/photo.jpg");
    expect(assetUrl("images/audit-1/img-1.jpg")).toBe("/assets/images/audit-1/img-1.jpg");
  });
});

describe("deriveAssetRef", () => {
  it("returns null for null/undefined input", () => {
    expect(deriveAssetRef(null)).toBeNull();
    expect(deriveAssetRef(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(deriveAssetRef("")).toBeNull();
  });

  it("derives the filename stem from a fixture path", () => {
    expect(deriveAssetRef("/fixtures/sanitaer-krause-berlin/web-img-1.jpg")).toBe("web-img-1");
    expect(deriveAssetRef("/fixtures/sanitaer-krause-berlin/gbp-screenshot-1.jpg")).toBe("gbp-screenshot-1");
  });

  it("prefers the preserved fixture asset id when replay ids differ from filenames", () => {
    expect(
      deriveAssetRef("/fixtures/sanitaer-krause-berlin/after-hero.jpg", {
        replay_fixture_asset_id: "gen-img-hero",
      })
    ).toBe("gen-img-hero");
  });

  it("ignores invalid preserved fixture ids and falls back to the filename stem", () => {
    expect(
      deriveAssetRef("/fixtures/sanitaer-krause-berlin/after-hero.jpg", {
        replay_fixture_asset_id: "",
      })
    ).toBe("after-hero");
    expect(deriveAssetRef("/fixtures/sanitaer-krause-berlin/after-hero.jpg", null)).toBe(
      "after-hero"
    );
  });

  it("derives the filename stem from a storage path", () => {
    expect(deriveAssetRef("storage/images/audit-1/img-3.jpg")).toBe("img-3");
    expect(deriveAssetRef("images/audit-1/img-3.jpg")).toBe("img-3");
  });

  it("strips only the final extension, keeping dots in the stem", () => {
    expect(deriveAssetRef("storage/images/audit-1/img.final.jpg")).toBe("img.final");
  });

  it("returns null when there is no filename segment", () => {
    expect(deriveAssetRef("/fixtures/sanitaer-krause-berlin/")).toBeNull();
  });
});
