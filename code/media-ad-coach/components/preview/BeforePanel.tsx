// F-075: honest "as-is" facsimile of what the business's current page shows
// a customer today. Deliberately plain — narrow measure, gray text, no
// cards, no motion — the drabness next to AfterPanel IS the point. Built
// from a real LIVE browser capture when available. If capture is unavailable,
// it falls back to preview_json.before (extracted original text + original
// image refs) and says so explicitly; it never invents content.
import { ImageOff } from "lucide-react";

import { AssetImage } from "../report/AssetImage";
import { SCREENSHOT_UNAVAILABLE_TITLE, safeUiText } from "../../lib/client/screenshotStatus";
import type { PreviewJson, WebsiteTextSection } from "../../lib/schemas";
import type { AssetLookup } from "./types";

export type BeforePanelProps = {
  preview: PreviewJson;
  assetsById: AssetLookup;
  beforeScreenshot: BeforeScreenshotPresentation | null;
};

export type BeforeScreenshotPresentation = {
  url: string | null;
  detail: string | null;
};

const SECTION_ORDER: WebsiteTextSection[] = ["hero", "about", "services", "footer"];
const SECTION_LABEL: Record<WebsiteTextSection, string> = {
  hero: "Header",
  about: "About",
  services: "Services",
  footer: "Footer",
};

export function BeforePanel({ preview, assetsById, beforeScreenshot }: BeforePanelProps) {
  const { sections, original_image_refs } = preview.before;

  const bySection = new Map<WebsiteTextSection, string[]>();
  for (const entry of sections) {
    const list = bySection.get(entry.section) ?? [];
    list.push(entry.text);
    bySection.set(entry.section, list);
  }

  // Surface what a strong page needs that this extracted one lacks, so the
  // Before reads as a convincingly weak real page rather than an empty half.
  const hasHeadline = (bySection.get("hero") ?? []).some((text) => text.trim().length > 0);
  const allBeforeText = sections.map((entry) => entry.text).join(" ").toLowerCase();
  const hasCtaSignal = /(anruf|kontakt|termin|jetzt|angebot|call|book|contact|quote|tel[:\s])/.test(
    allBeforeText
  );
  const weakSpots = [
    !hasHeadline && "No clear headline",
    !hasCtaSignal && "No clear call-to-action",
    original_image_refs.length === 0 && "No photos",
  ].filter((spot): spot is string => Boolean(spot));

  return (
    <div className="min-h-full bg-surface-alt px-6 py-10">
      <p className="mx-auto max-w-md text-center text-[13px] font-medium tracking-wide text-ink-secondary uppercase">
        What customers see today
      </p>

      {beforeScreenshot?.url ? (
        <div className="mx-auto mt-6 max-w-5xl overflow-hidden rounded-2xl border border-hairline bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- captured website pixels are served from local audit storage. */}
          <img
            src={beforeScreenshot.url}
            alt="Live browser capture of the business website before improvements"
            className="h-auto w-full"
          />
          <p className="border-t border-hairline px-4 py-2 text-[13px] text-ink-secondary">
            Live browser capture · 1440 × 900 viewport
          </p>
        </div>
      ) : (
        <div className="mx-auto mt-8 max-w-md">
          {/* ISS-026: the pane's main visual is a designed placeholder, never a
              text dump and never machine diagnostics. Same language as the
              report's Website card (ISS-023). The extracted text is real
              evidence, so it stays — one disclosure below, out of the way. */}
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-6 text-center">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-surface-alt text-ink-secondary"
              >
                <ImageOff className="size-5" />
              </span>
              <p className="text-[15px] font-medium text-ink">{SCREENSHOT_UNAVAILABLE_TITLE}</p>
              <p className="max-w-[34ch] overflow-hidden text-[13px] leading-relaxed break-words text-ink-secondary">
                We could not take a live picture of your site this time. Re-run the audit to
                capture it again.
              </p>
            </div>
            {/* ISS-023: allowlisted copy only — raw capture errors never render. */}
            {beforeScreenshot?.detail && (
              <p className="overflow-hidden border-t border-hairline px-4 py-2 text-[13px] break-words text-ink-secondary">
                {safeUiText(beforeScreenshot.detail)}
              </p>
            )}
          </div>

          {sections.length === 0 && (
            <p className="mt-6 text-sm text-ink-secondary">
              No visible text found — that is what your customer sees too.
            </p>
          )}

          {weakSpots.length > 0 && (
            <div className="mt-6 rounded-xl border border-hairline bg-surface px-4 py-3">
              <p className="text-[13px] font-medium tracking-wide text-ink-secondary/70 uppercase">
                Weak spots
              </p>
              <ul className="mt-2 space-y-1 text-[14px] text-ink-secondary">
                {weakSpots.map((spot) => (
                  <li key={spot} className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-destructive">
                      ✕
                    </span>
                    {spot}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(sections.length > 0 || original_image_refs.length > 0) && (
            <details className="group mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
              <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink-secondary transition-colors duration-200 ease-out hover:text-ink">
                Show the text we read from your site
                <span aria-hidden="true" className="ml-1.5 inline-block group-open:hidden">
                  ▸
                </span>
                <span aria-hidden="true" className="ml-1.5 hidden group-open:inline-block">
                  ▾
                </span>
              </summary>
              <div className="border-t border-hairline px-4 pt-4 pb-4">
                {SECTION_ORDER.filter((section) => bySection.has(section)).map((section) => (
                  <div key={section} className="mb-6 last:mb-0">
                    <p className="text-[13px] font-medium text-ink-secondary/70 uppercase">
                      {SECTION_LABEL[section]}
                    </p>
                    {bySection.get(section)!.map((text, i) => (
                      <p
                        key={i}
                        className="mt-1 overflow-hidden text-[15px] leading-relaxed break-words text-ink-secondary"
                      >
                        {text}
                      </p>
                    ))}
                  </div>
                ))}

                {original_image_refs.length > 0 && (
                  <div className="mt-6">
                    <p className="mb-2 text-[13px] font-medium tracking-wide text-ink-secondary/70 uppercase">
                      Current photos
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {original_image_refs.map((ref) => {
                        const asset = assetsById[ref] ?? null;
                        return (
                          <AssetImage
                            key={ref}
                            src={asset?.url ?? null}
                            alt="Original photo"
                            className="aspect-square"
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
