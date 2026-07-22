"use client";

// Shared <img> wrapper for storage/fixture-served images (F-068, reused by
// wave-2 ChannelRow/BeforeAfterInline). Fixture image files may not exist on
// disk yet — this NEVER substitutes a fake photo on error, only a neutral
// placeholder block, per the truth-discipline rule in AGENTS.md.
import * as React from "react";
import { ImageOff } from "lucide-react";

import { Badge } from "../primitives/Badge";
import { cn } from "@/lib/utils";

export type AssetImageProps = {
  src: string | null;
  alt: string;
  /** Truth badge for generated/edited imagery — omit for real photos. */
  label?: "ai_concept" | "enhanced" | null;
  className?: string;
};

export function AssetImage({ src, alt, label, className }: AssetImageProps) {
  const [failed, setFailed] = React.useState(false);
  const showFallback = !src || failed;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {showFallback ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-alt p-4 text-ink-secondary">
          <ImageOff className="size-6" aria-hidden="true" />
          <span className="text-[13px]">Image unavailable</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- storage-served
        // images come from an arbitrary local path via /assets/*, not a
        // Next-optimizable static import.
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {!showFallback && label && (
        <Badge variant={label} overlay>
          {label === "ai_concept" ? "AI concept" : "AI concept · Enhanced"}
        </Badge>
      )}
    </div>
  );
}
