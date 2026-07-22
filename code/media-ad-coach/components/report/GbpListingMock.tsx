// FEA-108: a pure-CSS Google-Maps-style business panel, filled with the
// business's REAL audit data. Every weak or missing field is flagged AT ITS
// SPOT (a "Missing" word-chip + red glyph — never colour alone, so it stays
// colourblind-safe) and paired with concrete expert advice. Truth discipline:
// absent evidence renders as an explicit gap, never an invented value. No
// image generation anywhere — this is a UI facsimile, labelled as such.
import * as React from "react";
import {
  Bookmark,
  Check,
  Clock,
  Flag,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  MapPin,
  Navigation,
  Phone,
  Star,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type { GbpDiagnostics, GbpReviewSnippet } from "./gbpTruthStates";
import { deriveGbpRowStates, isLiveMaps, type GbpDiagnostics } from "./gbpTruthStates";

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("size-4", i < rounded ? "fill-google-yellow text-google-yellow" : "text-hairline")}
        />
      ))}
    </span>
  );
}

function MissingChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-google-red/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-google-red uppercase">
      <Flag className="size-3" aria-hidden="true" />
      Missing
    </span>
  );
}

/** ISS-024: the third state. "We could not verify this" must never look like
 *  "you do not have this" — neutral gray, no red, no accusation. */
function UnverifiedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-ink-secondary uppercase">
      <HelpCircle className="size-3" aria-hidden="true" />
      Not verified
    </span>
  );
}

/** Marks which source a row's value came from — live Google Maps vs. the
 *  business website — so the two are never conflated (ISS-024). */
function SourceTag({ source }: { source: "live_maps" | "website" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
      {source === "live_maps" ? "from Google" : "from your website"}
    </span>
  );
}

/**
 * ISS-024: tri-state row.
 *   ok === true  → confirmed present (green check)
 *   ok === false → confirmed absent  (red MISSING chip + advice)
 *   ok == null   → never verified    (neutral chip + what-to-check note)
 */
function InfoRow({
  icon,
  primary,
  ok,
  advice,
  unverifiedNote,
  source,
}: {
  icon: React.ReactNode;
  primary: string;
  ok: boolean | null;
  advice: string;
  unverifiedNote: string;
  source?: "live_maps" | "website" | null;
}) {
  const missing = ok === false;
  const unverified = ok == null;
  return (
    <li className="flex items-start gap-3 border-t border-hairline py-3 first:border-t-0">
      <span
        className={cn(
          "mt-0.5 shrink-0",
          missing ? "text-google-red" : unverified ? "text-ink-secondary/50" : "text-ink-secondary"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[15px] break-words", unverified ? "text-ink-secondary" : "text-ink")}>
            {primary}
          </span>
          {missing ? <MissingChip /> : unverified ? <UnverifiedChip /> : <Check className="size-4 text-google-green" aria-label="present" />}
          {ok === true && source ? <SourceTag source={source} /> : null}
        </div>
        {(missing || unverified) && (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
            {missing ? advice : unverifiedNote}
          </p>
        )}
      </div>
    </li>
  );
}

export function GbpListingMock({ gbp }: { gbp: GbpDiagnostics }) {
  const hasRating = gbp.rating != null;
  // ISS-024: only a live Maps read can turn "we saw nothing" into "it is not
  // there". Everything else stays in the neutral, unverified state.
  const isLive = isLiveMaps(gbp);
  const rows = deriveGbpRowStates(gbp);
  const reviewText =
    gbp.reviewCount != null ? `${gbp.reviewCount} review${gbp.reviewCount === 1 ? "" : "s"}` : "no reviews found";

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      {/* faux Maps chrome */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline bg-surface-alt px-5 py-2.5">
        <MapPin className="size-4 text-google-red" aria-hidden="true" />
        <span className="text-[13px] font-medium text-ink-secondary">Your Google Maps listing (preview)</span>
        {isLive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-google-blue/30 px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em] text-google-blue uppercase">
            Live from Google
          </span>
        )}
      </div>

      <div className="p-5">
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{gbp.businessName}</h3>

        {/* rating */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {hasRating ? (
            <>
              <span className="text-[15px] font-medium text-ink">{gbp.rating!.toFixed(1)}</span>
              <Stars rating={gbp.rating!} />
              <span className="text-[14px] text-ink-secondary">{reviewText}</span>
            </>
          ) : (
            <>
              <Stars rating={0} />
              <span className="text-[14px] text-ink-secondary">
                {rows.rating === false ? "No rating yet" : "No rating found"}
              </span>
              {/* ISS-024: absent-because-checked vs. never-checked. */}
              {rows.rating === false ? <MissingChip /> : <UnverifiedChip />}
            </>
          )}
        </div>
        {!hasRating && (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
            {rows.rating === false
              ? "Ask happy customers for a Google review — a QR code on the invoice or a follow-up text lifts your star rating and review count fast. Reply to every review to rank higher."
              : "We could not read a rating in this run. If you already have reviews, they are not reachable from the links you gave us — worth checking your listing is claimed."}
          </p>
        )}

        <p className="mt-2 text-[14px] text-ink-secondary">
          {[gbp.category, gbp.city].filter(Boolean).join(" · ") || "Category not set"}
        </p>

        {/* Maps action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Directions", icon: Navigation },
            { label: "Save", icon: Bookmark },
            { label: "Website", icon: Globe, dim: !gbp.website },
            { label: "Call", icon: Phone, dim: !gbp.phone },
          ].map(({ label, icon: Icon, dim }) => (
            <span
              key={label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium",
                dim
                  ? "border-hairline text-ink-secondary/50"
                  : "border-google-blue/30 text-google-blue"
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>

        {/* diagnosed fields */}
        <ul className="mt-4">
          <InfoRow
            icon={<MapPin className="size-4" aria-hidden="true" />}
            primary={gbp.onMaps ? "Listed on Google Maps" : "Not on Google Maps"}
            ok={rows.onMaps}
            advice="Claim your free Google Business Profile so you appear on Maps and in ‘plumber near me’ searches."
            unverifiedNote="We could not check your Maps listing in this run."
          />
          <InfoRow
            icon={<Phone className="size-4" aria-hidden="true" />}
            primary={gbp.phone ?? "No phone number found"}
            ok={rows.phone}
            advice="Add a phone number — ‘Call’ is the action customers tap most on a Maps listing."
            unverifiedNote="We could not read a phone number from the sources we checked. If one is on your listing, it is not visible where customers look first."
            source={gbp.phoneSource}
          />
          <InfoRow
            icon={<Clock className="size-4" aria-hidden="true" />}
            primary={gbp.openingHoursText ?? (isLive ? "Opening hours not set" : "Opening hours not verified")}
            // ISS-024: data-driven. Only a live Maps read can prove hours are
            // absent; without it this stays neutral instead of accusing.
            ok={rows.openingHours}
            advice="Add opening hours so customers know when you’re available — and so ‘Open now’ filters surface you."
            unverifiedNote="We could not read opening hours in this run — check that they are filled in on your Google listing."
            source={gbp.openingHoursText ? "live_maps" : null}
          />
          <InfoRow
            icon={<Globe className="size-4" aria-hidden="true" />}
            primary={gbp.website ?? "No website linked"}
            ok={rows.website}
            advice="Link your website so visitors can learn more and book."
            unverifiedNote="We could not confirm a website link on your listing."
          />
          <InfoRow
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            primary={
              gbp.hasListingPhotos === true
                ? "Photos on the listing"
                : gbp.hasListingPhotos === false
                  ? "No photos on the listing"
                  : "Listing photos not verified"
            }
            ok={rows.listingPhotos}
            advice="Add real photos of your work, team, and van — listings with photos get far more clicks and calls."
            unverifiedNote="We could not see your listing’s photo gallery in this run. Open your profile and make sure recent photos are there."
            source={gbp.hasListingPhotos === true ? "live_maps" : null}
          />
          <InfoRow
            icon={<Star className="size-4" aria-hidden="true" />}
            primary={
              gbp.hasPhotoReviews === true
                ? "Reviews include customer photos"
                : gbp.hasPhotoReviews === false
                  ? "No customer photos in reviews"
                  : "Customer photos in reviews not verified"
            }
            ok={rows.photoReviews}
            advice="Ask happy customers to attach a photo to their review — photo reviews are the most persuasive proof you can get."
            unverifiedNote="We could not tell whether your reviews carry customer photos."
          />
        </ul>

        {/* FEA-101: real review excerpts, only when a live Maps read produced
            them — never paraphrased, never invented. */}
        {gbp.reviewSnippets.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-[13px] font-medium tracking-wide text-ink-secondary uppercase">
              What reviewers say {isLive ? "(from Google)" : ""}
            </p>
            <ul className="mt-2 space-y-2.5">
              {gbp.reviewSnippets.slice(0, 3).map((snippet, i) => (
                <li key={i} className="rounded-xl bg-surface-alt px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {snippet.author ? (
                      <span className="text-[13px] font-medium text-ink">{snippet.author}</span>
                    ) : null}
                    {typeof snippet.rating === "number" ? <Stars rating={snippet.rating} /> : null}
                  </div>
                  <p className="mt-1 overflow-hidden text-[14px] leading-relaxed break-words text-ink-secondary">
                    “{snippet.text}”
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
