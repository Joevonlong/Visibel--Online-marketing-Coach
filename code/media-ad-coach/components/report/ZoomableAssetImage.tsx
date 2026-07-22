"use client";

// FEA-106: an AssetImage that opens a full-size Lightbox on click. Used
// wherever a generated/enhanced (or original) photo is shown in the results so
// nothing is a tiny unclickable thumbnail. Truth + mode badges are forwarded
// to the lightbox. A real photo with no src degrades to a plain AssetImage
// (nothing to zoom).
import * as React from "react";
import { Maximize2 } from "lucide-react";

import { AssetImage } from "./AssetImage";
import { Lightbox } from "../primitives/Lightbox";
import { cn } from "@/lib/utils";

export type ZoomableAssetImageProps = {
  src: string | null;
  alt: string;
  label?: "ai_concept" | "enhanced" | null;
  /** Box sizing / aspect-ratio classes for the thumbnail (e.g. `aspect-[4/3]`). */
  className?: string;
  /** LIVE/REPLAY badge shown in the lightbox chrome. */
  executionMode?: "LIVE" | "REPLAY" | string | null;
  caption?: React.ReactNode;
};

export function ZoomableAssetImage({
  src,
  alt,
  label,
  className,
  executionMode,
  caption,
}: ZoomableAssetImageProps) {
  const [open, setOpen] = React.useState(false);

  if (!src) {
    return <AssetImage src={src} alt={alt} label={label} className={className} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Zoom image: ${alt}`}
        className={cn(
          "group relative block w-full cursor-zoom-in overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ink/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          className
        )}
      >
        <AssetImage src={src} alt={alt} label={label} className="h-full w-full" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full bg-ink/70 text-surface opacity-0 backdrop-blur-sm transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Maximize2 className="size-4" />
        </span>
      </button>
      <Lightbox
        open={open}
        onClose={() => setOpen(false)}
        src={src}
        alt={alt}
        label={label}
        executionMode={executionMode}
        caption={caption}
      />
    </>
  );
}
