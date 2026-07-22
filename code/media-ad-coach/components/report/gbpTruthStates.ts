// ISS-024: the truth decision for every row of the Google Business Profile
// card, kept as a pure module so it is testable without a DOM (this repo's
// vitest setup is node-only — no jsdom, no testing-library) and so the
// "unknown vs. absent" rule lives in exactly one place.
//
// The rule: a red "MISSING" chip is an accusation against a real business. We
// only make it when the run actually looked and found nothing. Everything else
// is `null` — rendered as a neutral "Not verified" state.

export type GbpReviewSnippet = {
  author?: string | null;
  rating?: number | null;
  text: string;
};

export type GbpDiagnostics = {
  businessName: string;
  category: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
  /** Where `phone` came from, so a website-derived number is never presented
   *  as if Google Maps confirmed it. */
  phoneSource: "live_maps" | "website" | null;
  onMaps: boolean;
  rating: number | null;
  reviewCount: number | null;
  /** true = photos confirmed on the listing, false = confirmed absent,
   *  null = never verified. */
  hasListingPhotos: boolean | null;
  /** The correctly-scoped signal — do REVIEWS carry customer photos. Distinct
   *  from `hasListingPhotos`; null = not verified. */
  hasPhotoReviews: boolean | null;
  /** FEA-101 live Maps field; null = not verified. */
  openingHoursText: string | null;
  /** FEA-101 live Maps review excerpts; empty = none available. */
  reviewSnippets: GbpReviewSnippet[];
  /** "live_maps" when the data above was corroborated against Google Maps. */
  liveSource: string | null;
};

/** true → confirmed present · false → confirmed absent · null → not verified */
export type TruthState = boolean | null;

export type GbpRowStates = {
  onMaps: TruthState;
  phone: TruthState;
  openingHours: TruthState;
  website: TruthState;
  listingPhotos: TruthState;
  photoReviews: TruthState;
  rating: TruthState;
};

/** Only a live Google Maps read can prove a listing field is absent. Without
 *  one, "we saw nothing" stays "not verified". */
export function isLiveMaps(gbp: Pick<GbpDiagnostics, "liveSource">): boolean {
  return gbp.liveSource === "live_maps";
}

export function deriveGbpRowStates(gbp: GbpDiagnostics): GbpRowStates {
  const live = isLiveMaps(gbp);
  return {
    onMaps: gbp.onMaps,
    // A phone can be proven present from either source; proving it ABSENT
    // needs a live listing read (the website simply may not print it).
    phone: gbp.phone ? true : live ? false : null,
    openingHours: gbp.openingHoursText ? true : live ? false : null,
    website: Boolean(gbp.website),
    listingPhotos: gbp.hasListingPhotos,
    photoReviews: gbp.hasPhotoReviews,
    rating: gbp.rating != null ? true : live ? false : null,
  };
}
