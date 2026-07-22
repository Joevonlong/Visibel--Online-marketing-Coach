"use client";

// F-076: side-by-side Before|After with a draggable divider (desktop demo
// default: split at 50%) plus a Before/After/Split segmented toggle for
// mobile and quick demo switching, plus a floating "what changed" chip
// built straight from preview_json.what_changed (F-054's accurate list —
// rendered verbatim, never embellished here).
import * as React from "react";
import { GripVertical, ListChecks, X } from "lucide-react";

import { AfterPanel } from "./AfterPanel";
import { BeforePanel, type BeforeScreenshotPresentation } from "./BeforePanel";
import type { AfterImageMetaBundle } from "./afterImageState";
import { cn } from "@/lib/utils";
import type { PreviewJson } from "../../lib/schemas";
import type { PreviewSitePage } from "./navigation";
import type { AssetLookup } from "./types";

export type SplitViewProps = {
  preview: PreviewJson;
  assetsById: AssetLookup;
  beforeScreenshot: BeforeScreenshotPresentation | null;
  auditId: string;
  sitePage: PreviewSitePage;
  executionMode?: "LIVE" | "REPLAY" | string | null;
  /** ISS-029: per-slot truth about the After page's images. */
  imageMeta?: AfterImageMetaBundle;
};

type ViewMode = "before" | "split" | "after";

const MIN_SPLIT = 15;
const MAX_SPLIT = 85;
const DEFAULT_SPLIT = 50;
const NUDGE = 2;

function clampSplit(value: number): number {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

export function SplitView({
  preview,
  assetsById,
  beforeScreenshot,
  auditId,
  sitePage,
  executionMode,
  imageMeta,
}: SplitViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const [split, setSplit] = React.useState(DEFAULT_SPLIT);
  const [mode, setMode] = React.useState<ViewMode>("split");
  const [changedOpen, setChangedOpen] = React.useState(false);

  const updateFromClientX = React.useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setSplit(clampSplit(((clientX - rect.left) / rect.width) * 100));
  }, []);

  React.useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    }
    function onPointerUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [updateFromClientX]);

  function onHandlePointerDown(event: React.PointerEvent) {
    draggingRef.current = true;
    event.preventDefault();
  }

  function onHandleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplit((prev) => clampSplit(prev - NUDGE));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplit((prev) => clampSplit(prev + NUDGE));
    }
  }

  const whatChanged = preview.what_changed;
  const showBefore = mode === "before" || mode === "split";
  const showAfter = mode === "after" || mode === "split";

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Before / Split / After toggle */}
      <div className="flex shrink-0 justify-center border-b border-hairline bg-surface py-2">
        <div className="inline-flex rounded-full bg-surface-alt p-1 text-sm">
          {(["before", "split", "after"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={cn(
                "rounded-full px-4 py-1.5 font-medium capitalize transition-colors duration-200 ease-out",
                mode === option ? "bg-ink text-surface" : "text-ink-secondary hover:text-ink"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {showBefore && (
          <div
            className={cn("h-full overflow-y-auto", mode === "split" && "absolute inset-y-0 left-0")}
            style={mode === "split" ? { width: `${split}%` } : undefined}
          >
            <BeforePanel preview={preview} assetsById={assetsById} beforeScreenshot={beforeScreenshot} />
          </div>
        )}

        {showAfter && (
          <div
            className={cn("h-full overflow-y-auto", mode === "split" && "absolute inset-y-0 right-0")}
            style={mode === "split" ? { width: `${100 - split}%` } : undefined}
          >
            <AfterPanel
              preview={preview}
              assetsById={assetsById}
              auditId={auditId}
              sitePage={sitePage}
              executionMode={executionMode}
              imageMeta={imageMeta}
            />
          </div>
        )}

        {mode === "split" && (
          <div
            role="slider"
            aria-label="Adjust before/after split"
            aria-valuenow={Math.round(split)}
            aria-valuemin={MIN_SPLIT}
            aria-valuemax={MAX_SPLIT}
            aria-orientation="horizontal"
            tabIndex={0}
            onPointerDown={onHandlePointerDown}
            onKeyDown={onHandleKeyDown}
            className="absolute top-0 bottom-0 z-20 flex w-6 -translate-x-1/2 touch-none cursor-col-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            style={{ left: `${split}%` }}
          >
            <div className="pointer-events-none h-full w-px bg-hairline" />
            <div className="pointer-events-none absolute flex size-8 items-center justify-center rounded-full border border-hairline bg-surface">
              <GripVertical className="size-4 text-ink-secondary" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      {/* floating "what changed" chip */}
      {whatChanged.length > 0 && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
          {changedOpen && (
            <div className="pointer-events-auto w-72 rounded-2xl border border-hairline bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">What changed</p>
                <button
                  type="button"
                  onClick={() => setChangedOpen(false)}
                  aria-label="Collapse what-changed list"
                  className="text-ink-secondary hover:text-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <ul className="space-y-1.5 text-left text-sm text-ink-secondary">
                {whatChanged.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-success">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => setChangedOpen((prev) => !prev)}
            aria-expanded={changedOpen}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors duration-200 ease-out hover:bg-surface-alt"
          >
            <ListChecks className="size-4 text-ink-secondary" aria-hidden="true" />
            {whatChanged.length} change{whatChanged.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
