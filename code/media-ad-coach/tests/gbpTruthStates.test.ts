// ISS-024 regression guard. Before this fix the Google Business Profile card
// asserted "MISSING" for things it had never checked: opening hours were
// hardcoded to absent, and `has_photo_reviews === true` collapsed null
// ("unknown") into false ("verified absent"). These tests pin the tri-state
// rule: only a live Maps read may produce a red MISSING chip.
import { describe, expect, it } from "vitest";

import { deriveGbpRowStates, type GbpDiagnostics } from "../components/report/gbpTruthStates";

function baseDiagnostics(overrides: Partial<GbpDiagnostics> = {}): GbpDiagnostics {
  return {
    businessName: "Rost & Weber GmbH",
    category: null,
    city: null,
    website: null,
    phone: null,
    phoneSource: null,
    onMaps: false,
    rating: null,
    reviewCount: null,
    hasListingPhotos: null,
    hasPhotoReviews: null,
    openingHoursText: null,
    reviewSnippets: [],
    liveSource: null,
    ...overrides,
  };
}

function countMissing(states: Record<string, boolean | null>): number {
  return Object.values(states).filter((state) => state === false).length;
}

describe("ISS-024 — GBP card tri-state truth", () => {
  it("never claims a field is missing when nothing was verified", () => {
    const states = deriveGbpRowStates(baseDiagnostics());
    // `onMaps` and `website` are the two rows the report itself decides, and
    // both are legitimately false here (no Maps presence, no website given).
    // Everything the audit did not actually inspect must be null, not false.
    expect(states.phone).toBeNull();
    expect(states.openingHours).toBeNull();
    expect(states.listingPhotos).toBeNull();
    expect(states.photoReviews).toBeNull();
    expect(states.rating).toBeNull();
  });

  it("keeps a confirmed absence (has_listing_photos === false) as exactly one MISSING row", () => {
    const states = deriveGbpRowStates(
      baseDiagnostics({ onMaps: true, website: "https://example.de", hasListingPhotos: false })
    );
    expect(states.listingPhotos).toBe(false);
    expect(countMissing(states)).toBe(1);
  });

  it("turns unknowns into confirmed absences only once Maps was actually read", () => {
    const live = deriveGbpRowStates(baseDiagnostics({ liveSource: "live_maps", onMaps: true }));
    expect(live.phone).toBe(false);
    expect(live.openingHours).toBe(false);
    expect(live.rating).toBe(false);
    // has_photo_reviews / has_listing_photos stay driven by their own values —
    // a live Maps read does not retroactively prove those.
    expect(live.listingPhotos).toBeNull();
    expect(live.photoReviews).toBeNull();
  });

  it("reports a present value regardless of which source proved it", () => {
    const fromWebsite = deriveGbpRowStates(
      baseDiagnostics({ phone: "030 12345678", phoneSource: "website" })
    );
    expect(fromWebsite.phone).toBe(true);

    const fromMaps = deriveGbpRowStates(
      baseDiagnostics({
        liveSource: "live_maps",
        phone: "030 12345678",
        phoneSource: "live_maps",
        openingHoursText: "Mo–Fr 08:00–17:00",
        rating: 4.6,
      })
    );
    expect(fromMaps.phone).toBe(true);
    expect(fromMaps.openingHours).toBe(true);
    expect(fromMaps.rating).toBe(true);
  });
});
