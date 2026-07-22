"use client";

// F-070/F-071: one row per channel (todo/improving/improved/coming_soon
// states) plus the pinned optimized_site hero variant. Purely presentational
// aside from its own expand/collapse + auto-expand-on-flip local state —
// the actual improve POST and optimistic "improving" overlay live in
// DiagnosticModules, which owns the shared pending/error bookkeeping across rows.
import * as React from "react";
import {
  Check,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Images,
  ListChecks,
  MapPin,
  PanelsTopLeft,
  PhoneCall,
  ScrollText,
  Type,
  Users,
  Wrench,
} from "lucide-react";

import { BeforeAfterInline, buildAssetLookup } from "./BeforeAfterInline";
import { CategoryChip } from "./CategoryChip";
import { imageCategoryLabel } from "./imageCategory";
import { resolvePartialFrame } from "./partialFrame";
import { ZoomableAssetImage } from "./ZoomableAssetImage";
import { deriveBeforeExcerpt } from "./beforeExcerpt";
import { safeUiText } from "../../lib/client/screenshotStatus";
import { Card } from "../primitives/Card";
import { PillButton } from "../primitives/PillButton";
import { SeverityDot } from "../primitives/SeverityDot";
import type { AssetView } from "../../lib/client/types";
import type { Channel } from "../../lib/schemas";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hero_headline: Type,
  business_description: FileText,
  services_copy: ListChecks,
  cta_contact: PhoneCall,
  legal_footer: ScrollText,
  platform_consistency: MapPin,
  hero_image: ImageIcon,
  work_proof_images: Images,
  team_image: Users,
  image_fixes: Wrench,
  optimized_site: PanelsTopLeft,
  promo_video: Clapperboard,
};

export type EffectiveStatus = "todo" | "improving" | "improved" | "coming_soon";

export type ChannelRowProps = {
  auditId: string;
  channel: Channel;
  assets: AssetView[];
  executionMode?: "LIVE" | "REPLAY" | string | null;
  effectiveStatus: EffectiveStatus;
  error?: string | null;
  onImprove: () => void;
  /** Renders the full-width "hero" treatment for the pinned optimized_site row. */
  hero?: boolean;
};

export function ChannelRow({ auditId, channel, assets, executionMode, effectiveStatus, error, onImprove, hero = false }: ChannelRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const prevStatusRef = React.useRef(channel.status);

  React.useEffect(() => {
    if (prevStatusRef.current !== "improved" && channel.status === "improved") {
      setExpanded(true);
    }
    prevStatusRef.current = channel.status;
  }, [channel.status]);

  const Icon = CHANNEL_ICONS[channel.id] ?? PanelsTopLeft;
  const beforeExcerpt = deriveBeforeExcerpt(channel.before);

  // FEA-115: a streamed partial is already a real render of this channel's
  // image (FEA-112). Show it while the channel is still improving instead of
  // holding a spinner over a picture that exists — labelled, never passed off
  // as the finished frame. The final overwrites the same asset in place, so
  // the swap into the full reveal below is seamless.
  const resolveAsset = React.useMemo(() => buildAssetLookup(assets), [assets]);
  const partialFrame = resolvePartialFrame(effectiveStatus, channel.after, (id) =>
    Boolean(resolveAsset(id))
  );
  const partialAsset = partialFrame ? resolveAsset(partialFrame.assetId) : undefined;
  const partialCategoryLabel = partialFrame ? imageCategoryLabel(partialFrame.category) : null;

  return (
    <Card
      variant="outlined"
      className={cn(
        "flex flex-col gap-4",
        hero && "border-ink/20 bg-surface-alt",
        effectiveStatus === "coming_soon" && "opacity-60"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              hero ? "bg-ink text-surface" : "bg-surface-alt text-ink-secondary"
            )}
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={cn("text-[17px] leading-snug font-semibold text-ink", hero && "text-[19px]")}>
                {channel.title}
              </h3>
              {effectiveStatus !== "coming_soon" && <SeverityDot severity={channel.severity} />}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{channel.one_liner}</p>
            {beforeExcerpt && effectiveStatus !== "improved" && (
              <p className="mt-1 truncate text-[13px] text-ink-secondary/80 italic">
                &ldquo;{beforeExcerpt}&rdquo;
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start">
          {effectiveStatus === "todo" && (
            <PillButton variant="primary" onClick={onImprove}>
              {hero ? "Do It For You" : "Improve It"}
            </PillButton>
          )}
          {effectiveStatus === "improving" && (
            <PillButton variant="primary" loading disabled>
              {hero ? "Do It For You" : "Improve It"}
            </PillButton>
          )}
          {effectiveStatus === "improved" && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                <Check className="size-4" aria-hidden="true" />
                Improved
              </span>
              {hero ? (
                // optimized_site's after_json stays null forever (its content
                // lives in audits.preview_json, docs/CONTRACTS.md) — there is
                // nothing for BeforeAfterInline to reveal inline, so point at
                // the real Before/After overlay (F-074) instead.
                <PillButton href={`/audit/${auditId}/preview`} variant="quiet">
                  See Before / After
                </PillButton>
              ) : (
                <PillButton variant="quiet" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Hide result" : "View result"}
                </PillButton>
              )}
            </div>
          )}
          {effectiveStatus === "coming_soon" && (
            <PillButton
              variant="quiet"
              disabled
              title="Video generation is on the roadmap — not in this version."
            >
              Coming soon
            </PillButton>
          )}
        </div>
      </div>

      {/* ISS-023: never let an error string widen the row. */}
      {error && (
        <p className="overflow-hidden text-sm break-words text-destructive">
          {safeUiText(error)}
        </p>
      )}

      {/* FEA-115: the early frame, with the same wording the preview uses. */}
      {!hero && partialAsset && (
        <div className="border-t border-hairline pt-4">
          <ZoomableAssetImage
            src={partialAsset.url}
            alt={`${channel.title} — early frame`}
            label={partialAsset.label as "ai_concept" | "enhanced" | null}
            executionMode={executionMode}
            caption={`${channel.title} — early frame`}
            className="aspect-[3/2] w-full"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-[12px] font-medium text-ink-secondary">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 animate-pulse rounded-full bg-ink-secondary/60"
              />
              Sharpening — a clearer version is on its way
            </span>
            {partialCategoryLabel && <CategoryChip label={partialCategoryLabel} />}
          </div>
        </div>
      )}

      {!hero && effectiveStatus === "improved" && expanded && (
        <div className="border-t border-hairline pt-4">
          <BeforeAfterInline channel={channel} assets={assets} executionMode={executionMode} />
        </div>
      )}
    </Card>
  );
}
