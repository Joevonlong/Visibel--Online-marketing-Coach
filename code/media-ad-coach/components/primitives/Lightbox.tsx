"use client";

// FEA-106: full-screen image zoom. Built on the same fixed-overlay + Escape
// pattern as PreviewOverlay (no new dependency). Sits at z-[70] so it layers
// above the Before/After preview overlay (z-50). Truth badges (AI concept /
// Enhanced) and the LIVE/REPLAY mode badge stay visible here too.
import * as React from "react";
import { X } from "lucide-react";

import { Badge } from "./Badge";

export type LightboxProps = {
  open: boolean;
  onClose: () => void;
  src: string | null;
  alt: string;
  /** Truth badge for generated/edited imagery — omit for real photos. */
  label?: "ai_concept" | "enhanced" | null;
  /** LIVE/REPLAY badge; omit if unknown on this surface. */
  executionMode?: "LIVE" | "REPLAY" | string | null;
  caption?: React.ReactNode;
};

export function Lightbox({ open, onClose, src, alt, label, executionMode, caption }: LightboxProps) {
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  const modeVariant =
    executionMode === "LIVE" ? "live" : executionMode === "REPLAY" ? "replay" : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col bg-ink/92 backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          {label && (
            <Badge variant={label}>{label === "ai_concept" ? "AI concept" : "AI concept · Enhanced"}</Badge>
          )}
          {modeVariant && <Badge variant={modeVariant} className="bg-surface/15 text-surface" />}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-surface/80 transition-colors duration-200 ease-out hover:bg-surface/15 hover:text-surface"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center px-4 pb-10 sm:px-10"
        onClick={(event) => event.stopPropagation()}
      >
        <figure className="flex max-h-full w-full max-w-4xl flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- storage-served image, not a Next static import */}
          {/* w-full inside the max-w-4xl frame scales small originals UP to a
              uniform large size; object-contain keeps aspect and max-h guards
              very tall sources. */}
          <img
            src={src}
            alt={alt}
            className="h-auto max-h-[80vh] w-full rounded-2xl object-contain shadow-2xl"
          />
          {caption && <figcaption className="max-w-2xl text-center text-[14px] text-surface/80">{caption}</figcaption>}
        </figure>
      </div>
    </div>
  );
}
