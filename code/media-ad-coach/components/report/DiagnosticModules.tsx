"use client";

// FEA-108: regroups the flat action list into four themed diagnostic modules
// (Google Business Profile & Maps · Google Search · Website · Photos &
// Reviews), each led by a UI-built diagnosis (the Maps listing / SERP mocks)
// and followed by that category's improvable channels. Owns the same improve
// bookkeeping ChannelList did (postImprove + optimistic "improving" state) so
// every "Improve It" / "Do It For You" still works from inside a module.
import * as React from "react";
import { Globe, Image as ImageIcon, ImageOff, MapPin, Search } from "lucide-react";

import { ChannelRow, type EffectiveStatus } from "./ChannelRow";
import { GbpListingMock, type GbpDiagnostics, type GbpReviewSnippet } from "./GbpListingMock";
import { SerpMock, type SerpDiagnostics } from "./SerpMock";
import { postImprove } from "./improveApi";
import { Eyebrow } from "../primitives/Eyebrow";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  groupChannelsByCategory,
  type ReportCategory,
} from "../../lib/client/reportCategories";
import { SCREENSHOT_UNAVAILABLE_TITLE, safeUiText } from "../../lib/client/screenshotStatus";
import type { AssetView } from "../../lib/client/types";
import type { Channel, Report } from "../../lib/schemas";
import { cn } from "@/lib/utils";

export type ReportBusiness = {
  brandName: string | null;
  category: string | null;
  city: string | null;
  website: string | null;
};

export type WebsiteMeta = {
  title: string | null;
  metaDescription: string | null;
  phone: string | null;
  https: boolean | null;
  hasImpressum: boolean | null;
};

export type BeforeScreenshot = { url: string | null; detail: string | null } | null;

/** ISS-024 / FEA-101: the live Google-Maps corroboration slice of
 *  `evidence_json.gbp`, normalized on the server. Every field is optional —
 *  absent means "not verified in this run", never "verified absent". */
export type GbpEvidenceView = {
  phone: string | null;
  openingHoursText: string | null;
  hasListingPhotos: boolean | null;
  reviewSnippets: GbpReviewSnippet[];
  liveSource: string | null;
} | null;

export type DiagnosticModulesProps = {
  auditId: string;
  channels: Channel[];
  assets: AssetView[];
  report: Report;
  business: ReportBusiness;
  websiteMeta: WebsiteMeta;
  gbpEvidence?: GbpEvidenceView;
  beforeScreenshot: BeforeScreenshot;
  executionMode?: "LIVE" | "REPLAY" | string | null;
};

const MODULE_THEME: Record<
  ReportCategory,
  { Icon: React.ComponentType<{ className?: string }>; iconClass: string }
> = {
  gbp: { Icon: MapPin, iconClass: "bg-google-red/10 text-google-red" },
  search: { Icon: Search, iconClass: "bg-google-blue/10 text-google-blue" },
  website: { Icon: Globe, iconClass: "bg-surface-alt text-ink-secondary" },
  photos: { Icon: ImageIcon, iconClass: "bg-surface-alt text-ink-secondary" },
};

function ModuleHeader({ category }: { category: ReportCategory }) {
  const meta = CATEGORY_META[category];
  const { Icon, iconClass } = MODULE_THEME[category];
  return (
    <div className="flex items-start gap-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", iconClass)} aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{meta.title}</h2>
        <p className="mt-0.5 text-[14px] text-ink-secondary">{meta.blurb}</p>
      </div>
    </div>
  );
}

function SiteHealthChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        ok ? "bg-success/12 text-success" : "bg-google-red/10 text-google-red"
      )}
    >
      <span aria-hidden="true">{ok ? "✓" : "✕"}</span>
      {label}
    </span>
  );
}

/** Left column of the Website module: the live before-screenshot when we have
 *  one, otherwise a truthful "current site" health snapshot from evidence. */
function WebsiteBeforeCard({
  beforeScreenshot,
  websiteMeta,
  website,
}: {
  beforeScreenshot: BeforeScreenshot;
  websiteMeta: WebsiteMeta;
  website: string | null;
}) {
  if (beforeScreenshot?.url) {
    return (
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- captured website pixels from local audit storage */}
        <img src={beforeScreenshot.url} alt="Your website today" className="h-auto w-full" />
        <p className="border-t border-hairline px-4 py-2 text-[13px] text-ink-secondary">
          Your site today · live capture
        </p>
      </div>
    );
  }

  // ISS-023: `detail` is allowlisted copy from lib/client/screenshotStatus; run
  // it through safeUiText anyway so no future caller can push raw error text
  // (long paths, CLI banners) into this card and break the layout.
  const captureNote = beforeScreenshot ? safeUiText(beforeScreenshot.detail) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface p-5">
      <Eyebrow>Your site today</Eyebrow>
      <p className="mt-2 truncate text-[15px] text-ink">
        {website ? website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "No website provided"}
      </p>
      {captureNote && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-hairline bg-surface-alt px-3.5 py-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-secondary"
          >
            <ImageOff className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{SCREENSHOT_UNAVAILABLE_TITLE}</p>
            <p className="mt-0.5 overflow-hidden text-[13px] break-words text-ink-secondary">
              {captureNote}
            </p>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <SiteHealthChip ok={websiteMeta.https === true} label={websiteMeta.https ? "HTTPS secure" : "Not secure (no HTTPS)"} />
        <SiteHealthChip ok={Boolean(websiteMeta.title)} label={websiteMeta.title ? "Has page title" : "No page title"} />
        <SiteHealthChip
          ok={Boolean(websiteMeta.metaDescription)}
          label={websiteMeta.metaDescription ? "Has description" : "No meta description"}
        />
        <SiteHealthChip ok={websiteMeta.hasImpressum === true} label={websiteMeta.hasImpressum ? "Impressum found" : "No Impressum"} />
      </div>
    </div>
  );
}

export function DiagnosticModules({
  auditId,
  channels,
  assets,
  report,
  business,
  websiteMeta,
  gbpEvidence,
  beforeScreenshot,
  executionMode,
}: DiagnosticModulesProps) {
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [errors, setErrors] = React.useState<Record<string, string | null>>({});

  React.useEffect(() => {
    setPendingIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const channel of channels) {
        if (next.has(channel.id) && channel.status !== "todo") {
          next.delete(channel.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [channels]);

  async function triggerImprove(channelId: string, selection: string[] | "all") {
    setErrors((prev) => ({ ...prev, [channelId]: null }));
    setPendingIds((prev) => new Set(prev).add(channelId));
    const result = await postImprove(auditId, selection);
    if (!result.ok) {
      // ISS-023: API failures can carry long machine text — normalize before it
      // reaches the UI so it can never overflow a row.
      setErrors((prev) => ({
        ...prev,
        [channelId]: safeUiText(result.error) ?? "That did not work. Please try again.",
      }));
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  }

  const grouped = groupChannelsByCategory(channels);

  // ISS-024: `?? null` everywhere — an absent signal is "not verified", never
  // "verified absent". `=== true` collapsing was the original bug.
  const gbp: GbpDiagnostics = {
    businessName: business.brandName ?? "Your business",
    category: business.category,
    city: business.city,
    website: business.website,
    phone: gbpEvidence?.phone ?? websiteMeta.phone,
    phoneSource: gbpEvidence?.phone ? "live_maps" : websiteMeta.phone ? "website" : null,
    onMaps: report.presence_coverage.maps,
    rating: report.reputation_chips?.rating ?? null,
    reviewCount: report.reputation_chips?.review_count ?? null,
    hasListingPhotos: gbpEvidence?.hasListingPhotos ?? null,
    hasPhotoReviews: report.reputation_chips?.has_photo_reviews ?? null,
    openingHoursText: gbpEvidence?.openingHoursText ?? null,
    reviewSnippets: gbpEvidence?.reviewSnippets ?? [],
    liveSource: gbpEvidence?.liveSource ?? null,
  };

  const serp: SerpDiagnostics = {
    website: business.website,
    title: websiteMeta.title,
    metaDescription: websiteMeta.metaDescription,
    brandName: business.brandName ?? "Your business",
    category: business.category,
    city: business.city,
    findability: report.findability,
  };

  function renderRows(list: Channel[]) {
    return list.map((channel) => {
      const isHero = channel.id === "optimized_site";
      const isPending = pendingIds.has(channel.id);
      const effectiveStatus: EffectiveStatus =
        channel.status === "todo" && isPending ? "improving" : (channel.status as EffectiveStatus);
      return (
        <ChannelRow
          key={channel.id}
          auditId={auditId}
          channel={channel}
          assets={assets}
          executionMode={executionMode}
          effectiveStatus={effectiveStatus}
          error={errors[channel.id] ?? null}
          hero={isHero}
          onImprove={() => triggerImprove(channel.id, isHero ? "all" : [channel.id])}
        />
      );
    });
  }

  function renderModule(category: ReportCategory) {
    const list = grouped[category];
    const hasMock = category === "gbp" || category === "search";
    if (list.length === 0 && !hasMock) return null;

    return (
      <section key={category} className="py-8 first:pt-2">
        <ModuleHeader category={category} />

        {category === "website" ? (
          // items-start so the left card hugs its content instead of stretching
          // to the full height of the (much taller) advice stack; sticky so it
          // rides alongside as the stack scrolls (ISS review r1 P1).
          <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="lg:sticky lg:top-[88px]">
              <WebsiteBeforeCard
                beforeScreenshot={beforeScreenshot}
                websiteMeta={websiteMeta}
                website={business.website}
              />
            </div>
            <div className="flex flex-col gap-4">{renderRows(list)}</div>
          </div>
        ) : (
          <>
            {category === "gbp" && (
              <div className="mt-5">
                <GbpListingMock gbp={gbp} />
              </div>
            )}
            {category === "search" && (
              <div className="mt-5">
                <SerpMock serp={serp} />
              </div>
            )}
            {list.length > 0 && <div className="mt-5 flex flex-col gap-4">{renderRows(list)}</div>}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl divide-y divide-hairline px-6 pb-24">
      {CATEGORY_ORDER.map(renderModule)}
    </div>
  );
}
