"use client";

// F-074/F-078: full-screen overlay of the assembled Before/After preview.
// Renders on top of the report page (the product stays a three-page story)
// — close (X button or Escape) returns to /audit/[id]'s channel list. The
// optimized mini-site itself can navigate Home ↔ Services (F-112), while the
// truthful LIVE/REPLAY badge stays visible in this outer preview chrome.
import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Badge } from "../primitives/Badge";
import { useAuditPoll } from "../../lib/client/poll";
import { SplitView } from "./SplitView";
import type { BeforeScreenshotPresentation } from "./BeforePanel";
import type { AfterImageMetaBundle } from "./afterImageState";
import type { PreviewSitePage } from "./navigation";
import type { AssetLookup } from "./types";
import type { PreviewJson } from "../../lib/schemas";

export type PreviewOverlayProps = {
  preview: PreviewJson;
  assetsById: AssetLookup;
  businessName: string;
  executionMode: string;
  auditId: string;
  beforeScreenshot: BeforeScreenshotPresentation | null;
  sitePage: PreviewSitePage;
  /** ISS-029: per-slot truth about the After page's images. */
  imageMeta?: AfterImageMetaBundle;
};

export function PreviewOverlay({
  preview,
  assetsById,
  businessName,
  executionMode,
  auditId,
  beforeScreenshot,
  sitePage,
  imageMeta,
}: PreviewOverlayProps) {
  const router = useRouter();

  // ISS-032: this overlay is server-rendered from preview_json + asset rows and
  // had no live updates at all. Under FEA-112 the images land tens of seconds
  // after the audit reports "complete", so the Before/After view — the whole
  // point of the page — sat on early frames until someone reloaded by hand.
  // Watch the same endpoint the report page watches and re-render the server
  // tree whenever an image moves.
  const { data } = useAuditPoll(auditId);
  const imageSignature = React.useMemo(() => {
    if (!data) return null;
    const channels = (data.channels ?? [])
      .map((channel) => {
        const after = channel.after as { generated_asset_id?: unknown } | null;
        const generated =
          after && typeof after === "object" && typeof after.generated_asset_id === "string"
            ? after.generated_asset_id
            : "";
        return `${channel.id}:${channel.status}:${generated}`;
      })
      .sort()
      .join(",");
    return `${data.images_pending ?? 0}|${channels}`;
  }, [data]);

  const signatureRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (imageSignature === null) return;
    if (signatureRef.current === null) {
      signatureRef.current = imageSignature;
      return;
    }
    if (signatureRef.current !== imageSignature) {
      signatureRef.current = imageSignature;
      router.refresh();
    }
  }, [imageSignature, router]);

  const close = React.useCallback(() => {
    router.push(`/audit/${auditId}`);
  }, [router, auditId]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const badgeVariant = executionMode === "LIVE" ? "live" : "replay";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-surface/95 px-6 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate text-[15px] font-semibold text-ink">
            {businessName}{" "}
            <span className="font-normal text-ink-secondary">— from Zero to Hero.</span>
          </p>
          <Badge variant={badgeVariant} />
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close preview"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors duration-200 ease-out hover:bg-surface-alt hover:text-ink"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        <SplitView
          preview={preview}
          assetsById={assetsById}
          beforeScreenshot={beforeScreenshot}
          auditId={auditId}
          sitePage={sitePage}
          executionMode={executionMode}
          imageMeta={imageMeta}
        />
      </div>
    </div>
  );
}
