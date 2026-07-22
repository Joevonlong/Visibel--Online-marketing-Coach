"use client";

// F-068: worst text findings + worst images, both tappable to expand — the
// "every number click-traceable to a quote or photo" pitch (docs/CONTRACTS.md
// F-066 accept note extends to this component too).
import * as React from "react";

import { AssetImage } from "./AssetImage";
import { Eyebrow } from "../primitives/Eyebrow";
import { SeverityDot, type Severity } from "../primitives/SeverityDot";
import type { AssetView } from "../../lib/client/types";
import type { Criterion, Finding, Report } from "../../lib/schemas";
import { cn } from "@/lib/utils";

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function findingSource(report: Report, finding: Finding): Criterion["source"] | "absent" {
  const criteria = finding.lane === "text" ? report.text.criteria : undefined;
  const match = criteria?.find((c) => c.id === finding.criterion);
  return match?.source ?? "absent";
}

function WorstFindingRow({ finding, source }: { finding: Finding; source: string }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 ease-out hover:bg-surface-alt"
      >
        <span className="mt-1.5 shrink-0">
          <SeverityDot severity={finding.severity} />
        </span>
        <span className="flex-1">
          <span className={cn("text-[15px] text-ink", !expanded && "line-clamp-2")}>
            &ldquo;{finding.evidence_quote}&rdquo;
          </span>
          <span className="mt-1 block">
            <span className="inline-flex items-center rounded-full bg-surface-alt px-2 py-0.5 text-[13px] text-ink-secondary">
              {source}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

const ABSENT_ASSET_KEY = "_absent";

/** Mirrors ScoreHeader's `hasImages` check: lib/rubric.ts only ever writes
 *  the synthetic `_absent` pseudo-asset when zero images were scorable —
 *  real per-asset criteria are keyed by real asset ids, never mixed with
 *  `_absent`. Checking the criteria_by_asset KEYS (rather than whether any
 *  asset row happens to resolve) keeps this truthful even when REPLAY's
 *  fixture asset ids don't line up with the freshly-inserted db rows (see
 *  lib/client/assets.ts#deriveAssetRef) — the lane was still scored from
 *  real images either way. */
function hasRealImageCriteria(report: Report): boolean {
  const keys = Object.keys(report.images.criteria_by_asset);
  return !(keys.length === 0 || (keys.length === 1 && keys[0] === ABSENT_ASSET_KEY));
}

function worstImageAssets(
  report: Report,
  assets: AssetView[]
): { assetId: string; asset: AssetView | null; avgScore: number; worstCriterion: Criterion }[] {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const assetByRef = new Map(
    assets.filter((a): a is AssetView & { ref: string } => Boolean(a.ref)).map((a) => [a.ref, a])
  );

  const rows = Object.entries(report.images.criteria_by_asset)
    .filter(([assetId]) => assetId !== ABSENT_ASSET_KEY)
    .map(([assetId, criteria]) => {
      const avgScore =
        criteria.length > 0
          ? criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length
          : 0;
      const worstCriterion = [...criteria].sort((a, b) => a.score - b.score)[0];
      return { assetId, criteria, avgScore, worstCriterion };
    })
    .filter((row) => Boolean(row.worstCriterion))
    .map((row) => ({
      assetId: row.assetId,
      // Match by db `id` first, then fall back to the fixture-derived `ref`
      // — never null out a real, scored image just because the ids don't
      // line up (REPLAY re-inserts fixture assets under fresh uuids).
      asset: assetById.get(row.assetId) ?? assetByRef.get(row.assetId) ?? null,
      avgScore: row.avgScore,
      worstCriterion: row.worstCriterion,
    }));

  return rows.sort((a, b) => a.avgScore - b.avgScore).slice(0, 3);
}

function WorstImageCard({
  asset,
  worstCriterion,
}: {
  asset: AssetView | null;
  worstCriterion: Criterion;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="block w-full text-left"
    >
      <AssetImage
        src={asset?.url ?? null}
        alt={worstCriterion.evidence}
        label={(asset?.label as "ai_concept" | "enhanced" | null) ?? null}
        className="aspect-[4/3] w-full"
      />
      <p className={cn("mt-2 text-[13px] leading-relaxed text-ink-secondary", !expanded && "line-clamp-2")}>
        {worstCriterion.evidence}
      </p>
    </button>
  );
}

export type EvidenceHighlightsProps = {
  report: Report;
  assets: AssetView[];
};

export function EvidenceHighlights({ report, assets }: EvidenceHighlightsProps) {
  const worstFindings = report.findings
    .filter((f) => f.lane === "text")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 4);

  const hasImages = hasRealImageCriteria(report);
  const worstImages = worstImageAssets(report, assets);

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12">
      <Eyebrow>The evidence</Eyebrow>
      <div className="mt-3 grid gap-10 md:grid-cols-2 md:gap-14">
      <div className="border-t border-hairline pt-7">
        <h2 className="mb-4 text-xl font-semibold text-ink">Worst quotes</h2>
        {worstFindings.length === 0 ? (
          <p className="text-sm text-ink-secondary">No findings recorded.</p>
        ) : (
          <ul className="space-y-1">
            {worstFindings.map((finding) => (
              <WorstFindingRow key={finding.id} finding={finding} source={findingSource(report, finding)} />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-hairline pt-7">
        <h2 className="mb-4 text-xl font-semibold text-ink">Photos to improve</h2>
        {!hasImages ? (
          <p className="text-sm text-ink-secondary">No usable images — scored from absence.</p>
        ) : worstImages.length === 0 ? (
          <p className="text-sm text-ink-secondary">No image findings to highlight.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {worstImages.map((row) => (
              <WorstImageCard key={row.assetId} asset={row.asset} worstCriterion={row.worstCriterion} />
            ))}
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
