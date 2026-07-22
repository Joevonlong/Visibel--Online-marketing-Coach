// FEA-108: map the flat 12-channel action list onto the four diagnostic
// categories the report is regrouped into. Pure + frontend-owned so it stays
// unit-testable under vitest with relative imports. Rendering (themed modules,
// Google-Maps / SERP mocks) lives in components/report/*.
import type { Channel } from "../schemas";

export type ReportCategory = "gbp" | "search" | "website" | "photos";

/** Display order of the modules, top to bottom. */
export const CATEGORY_ORDER: ReportCategory[] = ["gbp", "search", "website", "photos"];

export const CATEGORY_META: Record<
  ReportCategory,
  { title: string; blurb: string }
> = {
  gbp: {
    title: "Google Business Profile & Maps",
    blurb: "How your business looks when someone finds you on Google Maps.",
  },
  search: {
    title: "Google Search presence",
    blurb: "What shows up when someone googles your name or trade.",
  },
  website: {
    title: "Website",
    blurb: "The copy and structure of the page customers land on.",
  },
  photos: {
    title: "Photos & Reviews",
    blurb: "The images and social proof customers judge you by.",
  },
};

const CHANNEL_CATEGORY: Record<string, ReportCategory> = {
  // GBP / Maps — name/phone/address consistency across listings.
  platform_consistency: "gbp",
  // Website — page copy + the assembled optimized page.
  hero_headline: "website",
  business_description: "website",
  services_copy: "website",
  cta_contact: "website",
  legal_footer: "website",
  optimized_site: "website",
  // Photos & Reviews — every visual/media channel.
  hero_image: "photos",
  work_proof_images: "photos",
  team_image: "photos",
  image_fixes: "photos",
  promo_video: "photos",
};

/** The category a channel belongs to; unknown ids fall back to "website". */
export function categoryOfChannel(channelId: string): ReportCategory {
  return CHANNEL_CATEGORY[channelId] ?? "website";
}

/** Bucket channels by category, preserving the incoming (rubric) order within
 *  each bucket. Search has no channels of its own — it is a mock-only module. */
export function groupChannelsByCategory(
  channels: Channel[]
): Record<ReportCategory, Channel[]> {
  const groups: Record<ReportCategory, Channel[]> = {
    gbp: [],
    search: [],
    website: [],
    photos: [],
  };
  for (const channel of channels) {
    groups[categoryOfChannel(channel.id)].push(channel);
  }
  return groups;
}
