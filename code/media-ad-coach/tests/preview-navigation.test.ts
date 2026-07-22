import { describe, expect, it } from "vitest";
import { parsePreviewSitePage, previewSiteHref } from "../components/preview/navigation";

describe("preview website navigation (F-112)", () => {
  it("recognizes only the services subpage and safely falls back to home", () => {
    expect(parsePreviewSitePage("services")).toBe("services");
    expect(parsePreviewSitePage(["services", "home"])).toBe("services");
    expect(parsePreviewSitePage("unknown")).toBe("home");
    expect(parsePreviewSitePage(undefined)).toBe("home");
  });

  it("builds refreshable links for both optimized-site pages", () => {
    expect(previewSiteHref("audit-123", "home")).toBe("/audit/audit-123/preview");
    expect(previewSiteHref("audit-123", "services")).toBe(
      "/audit/audit-123/preview?site=services"
    );
  });

  it("encodes an audit id before inserting it into the preview path", () => {
    expect(previewSiteHref("unsafe/id", "services")).toBe(
      "/audit/unsafe%2Fid/preview?site=services"
    );
  });
});
