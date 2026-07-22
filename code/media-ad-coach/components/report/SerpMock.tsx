// FEA-108: a Google-search-result facsimile for the Search module, built from
// real evidence (the audit's website title/meta + the Tavily findability
// check). Weaknesses are annotated in place; when the business does not rank,
// the competitors that DO are shown honestly. No invented values.
import * as React from "react";
import { Flag, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type Findability = {
  status: "found" | "portals_only" | "not_found" | "error";
  results: { title: string; url: string }[];
};

export type SerpDiagnostics = {
  website: string | null;
  title: string | null;
  metaDescription: string | null;
  brandName: string;
  category: string | null;
  city: string | null;
  findability: Findability;
};

const STATUS_BANNER: Record<
  Findability["status"],
  { tone: "bad" | "warn" | "good" | "neutral"; text: string }
> = {
  not_found: { tone: "bad", text: "Your own site isn’t on Google’s first page for your trade and city." },
  portals_only: { tone: "warn", text: "Only directory listings show up — not your own website." },
  found: { tone: "good", text: "You appear in Google search results." },
  error: { tone: "neutral", text: "The search check couldn’t run this time (Tavily error) — findings below are marked ASSUMPTION." },
};

const TONE_CLASS: Record<"bad" | "warn" | "good" | "neutral", string> = {
  bad: "bg-google-red/10 text-google-red",
  warn: "bg-google-yellow/15 text-[#8a6d00]",
  good: "bg-google-green/10 text-google-green",
  neutral: "bg-surface-alt text-ink-secondary",
};

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function MissingChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-google-red/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-google-red uppercase">
      <Flag className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function SerpMock({ serp }: { serp: SerpDiagnostics }) {
  const banner = STATUS_BANNER[serp.findability.status];
  const fallbackTitle = [serp.brandName, [serp.category, serp.city].filter(Boolean).join(" in ")]
    .filter(Boolean)
    .join(" — ");
  const competitors = serp.findability.results.slice(0, 3);
  const showCompetitors =
    (serp.findability.status === "not_found" || serp.findability.status === "portals_only") &&
    competitors.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-alt px-5 py-2.5">
        <Search className="size-4 text-google-blue" aria-hidden="true" />
        <span className="text-[13px] font-medium text-ink-secondary">Google Search (preview)</span>
      </div>

      <div className="p-5">
        <p className={cn("rounded-lg px-3 py-2 text-[13px] font-medium", TONE_CLASS[banner.tone])}>
          {banner.text}
        </p>

        {/* the business's own snippet */}
        <div className="mt-5 border-l-2 border-google-blue/30 pl-4">
          {serp.website ? (
            <p className="truncate text-[13px] text-ink-secondary">{displayUrl(serp.website)}</p>
          ) : (
            <span className="inline-flex">
              <MissingChip label="No website" />
            </span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[20px] leading-snug font-medium text-google-blue">
              {serp.title ?? fallbackTitle}
            </span>
            {!serp.title && <MissingChip label="No title tag" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {serp.metaDescription ? (
              <p className="text-[14px] leading-relaxed text-ink-secondary">{serp.metaDescription}</p>
            ) : (
              <>
                <p className="text-[14px] text-ink-secondary/70 italic">
                  Google will guess a description from your page text.
                </p>
                <MissingChip label="No meta description" />
              </>
            )}
          </div>
        </div>

        {showCompetitors && (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-[13px] font-medium text-ink-secondary">Ranking ahead of you today:</p>
            <ul className="mt-2 space-y-1.5">
              {competitors.map((result) => (
                <li key={result.url} className="truncate text-[14px]">
                  <span className="text-ink">{result.title}</span>
                  <span className="ml-2 text-[12px] text-ink-secondary">{displayUrl(result.url)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 border-t border-hairline pt-4 text-[13px] leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Fix it:</span> set a clear page title and meta
          description naming your service + city (e.g. “{fallbackTitle}”), earn Google reviews, and
          link your site from your Business Profile so Google trusts and ranks it.
        </p>
      </div>
    </div>
  );
}
