// F-074: the assembled Apple-style one-pager rendered straight from
// PreviewJson — this IS the wow moment. Sections render in the fixed order
// from plan §4.4; every optional field degrades quietly (hidden, not a
// broken layout) rather than showing an empty card. Reuses AssetImage for
// every image so the "AI concept" truth badge and graceful fallback are
// never re-implemented here.
import Link from "next/link";
import { Award, Camera, ImageOff, Phone } from "lucide-react";

import { ZoomableAssetImage } from "../report/ZoomableAssetImage";
import { CategoryChip } from "../report/CategoryChip";
import { imageCategoryLabel } from "../report/imageCategory";
import { PillButton } from "../primitives/PillButton";
import { previewSiteHref, type PreviewSitePage } from "./navigation";
import { heroBrandNameClass, resolveBrandName } from "./brandName";
import { ServicesSubpage } from "./ServicesSubpage";
import {
  EMPTY_AFTER_IMAGE_META,
  resolveAfterImageSource,
  type AfterImageMeta,
  type AfterImageMetaBundle,
} from "./afterImageState";
import type { PreviewJson } from "../../lib/schemas";
import type { AssetLookup } from "./types";
import { cn } from "@/lib/utils";

export type AfterPanelProps = {
  preview: PreviewJson;
  assetsById: AssetLookup;
  auditId: string;
  sitePage: PreviewSitePage;
  executionMode?: "LIVE" | "REPLAY" | string | null;
  /** ISS-029: what each After image slot really is. Optional — absent means
   *  "no backend declaration", and the asset-label heuristic decides. */
  imageMeta?: AfterImageMetaBundle;
};

function resolveAsset(assetsById: AssetLookup, ref: string | null) {
  if (!ref) return null;
  return assetsById[ref] ?? null;
}

/** ISS-032 / FEA-112: what the visitor sees IS a real render of their image,
 *  just an early, softer frame of it. Say that plainly while the sharp one is
 *  still coming — same neutral language as the ISS-029 states, no spinner
 *  theatre. */
function SharpeningChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-[12px] font-medium text-ink-secondary">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 animate-pulse rounded-full bg-ink-secondary/60"
      />
      Sharpening — a clearer version is on its way
    </span>
  );
}

/**
 * ISS-029: the only place an After-page image is rendered. Three honest
 * outcomes, never a silent one:
 *   generated         — the AI concept, badged as such by AssetImage.
 *   harvested_fallback— the business's own current photo standing in, labelled
 *                       "Your current photo" and explained, so nobody reads it
 *                       as an optimization result.
 *   none              — a designed placeholder card; the block never vanishes.
 */
function AfterImageSlot({
  src,
  alt,
  assetLabel,
  partialOnly = false,
  category,
  meta = EMPTY_AFTER_IMAGE_META.hero,
  executionMode,
  caption,
  className,
}: {
  src: string | null;
  alt: string;
  assetLabel: string | null | undefined;
  partialOnly?: boolean;
  /** ISS-033 / FEA-114: what this slot depicts. Absent on pre-FEA-114 rows. */
  category?: unknown;
  meta?: AfterImageMeta;
  executionMode?: "LIVE" | "REPLAY" | string | null;
  caption: string;
  className: string;
}) {
  const source = resolveAfterImageSource(Boolean(src), assetLabel, meta);

  if (source === "none") {
    return (
      <div className={`overflow-hidden rounded-2xl border border-hairline bg-surface ${className}`}>
        <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-6 text-center">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full bg-surface-alt text-ink-secondary"
          >
            <ImageOff className="size-5" />
          </span>
          <p className="text-[14px] font-medium text-ink">No image for this section yet</p>
          <p className="max-w-[34ch] overflow-hidden text-[13px] leading-relaxed break-words text-ink-secondary">
            Nothing was generated or found for this spot — retry the improvement to try again.
          </p>
        </div>
      </div>
    );
  }

  const pending = meta.generationPending;
  const categoryLabel = imageCategoryLabel(category);

  if (source === "harvested_fallback") {
    return (
      <div>
        <ZoomableAssetImage
          src={src}
          alt={alt}
          // Deliberately no truth badge: this IS a real photo, and claiming
          // "AI concept" over it would be the opposite lie.
          label={null}
          executionMode={executionMode}
          caption={`${caption} — your current photo`}
          className={className}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-[12px] font-medium text-ink-secondary">
            <Camera className="size-3.5" aria-hidden="true" />
            Your current photo
          </span>
          {categoryLabel && <CategoryChip label={categoryLabel} />}
        </div>
        <p className="mt-1.5 overflow-hidden text-[13px] leading-relaxed break-words text-ink-secondary">
          {pending
            ? "Your new image is still being generated — this is the photo already on your site until it lands."
            : "A new image wasn\u2019t generated this time — this is the photo already on your site."}
        </p>
      </div>
    );
  }

  // Generated. It may still be an early frame (`pending`), or a partial whose
  // final frame never arrived (`partialOnly`) — both are real renders of this
  // image, and both are labelled rather than passed off as finished.
  if (pending || partialOnly) {
    return (
      <div>
        <ZoomableAssetImage
          src={src}
          alt={alt}
          label={assetLabel as "ai_concept" | "enhanced" | null}
          executionMode={executionMode}
          caption={caption}
          className={className}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {pending ? (
            <SharpeningChip />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-[12px] font-medium text-ink-secondary">
              Early frame — the sharper version didn&rsquo;t finish
            </span>
          )}
          {categoryLabel && <CategoryChip label={categoryLabel} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ZoomableAssetImage
        src={src}
        alt={alt}
        label={assetLabel as "ai_concept" | "enhanced" | null}
        executionMode={executionMode}
        caption={caption}
        className={className}
      />
      {categoryLabel && (
        <div className="mt-2">
          <CategoryChip label={categoryLabel} />
        </div>
      )}
    </div>
  );
}

export function AfterPanel({
  preview,
  assetsById,
  auditId,
  sitePage,
  executionMode,
  imageMeta = EMPTY_AFTER_IMAGE_META,
}: AfterPanelProps) {
  const { header, hero, trust_bar, services, gallery, about_team, contact, legal_footer } = preview;

  const heroAsset = resolveAsset(assetsById, hero.hero_image_ref);
  const teamAsset = resolveAsset(assetsById, about_team.team_image_ref);

  const trustEntries = [trust_bar.years_in_business, ...trust_bar.certifications, trust_bar.review_chip].filter(
    (entry): entry is string => Boolean(entry)
  );

  const hasLegalFooter = Boolean(legal_footer.impressum || legal_footer.datenschutz);

  // FEA-116: the visitor must always know whose site they are on. Never a
  // placeholder — if the audit has no name, the brand lines simply do not render.
  const brandName = resolveBrandName(header.business_name);

  // FEA-110: keep AI concepts and retained REAL photos in separate blocks so
  // originals are never scattered among generated imagery. A gallery item is a
  // real original when its resolved asset (or the item's own) has no label.
  const effectiveLabel = (item: (typeof gallery)[number]) => assetsById[item.asset_ref]?.label ?? item.label;
  const conceptGallery = gallery.filter((item) => effectiveLabel(item) != null);
  const originalGallery = gallery.filter((item) => effectiveLabel(item) == null);

  return (
    <div className="bg-surface">
      {/* mini nav — F-112 keeps the two-page preview URL-addressable. */}
      <div className="@container sticky top-0 z-10 border-b border-hairline bg-surface/90 px-6 py-3 backdrop-blur-sm">
        {/* ISS-037: in a narrow SplitView pane the two nav pills ate the whole
            row and `truncate` collapsed the brand to nothing — the one thing
            FEA-116 put there. Below the container's @xs the header stacks, so
            the name always has a full line of its own. */}
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-2 @xs:flex-row @xs:items-center @xs:justify-between @xs:gap-4">
          {/* FEA-116: the brand slot — larger, and a real link home. `truncate`
              keeps a very long GmbH name from pushing the nav off the row. */}
          {brandName ? (
            <Link
              href={previewSiteHref(auditId, "home")}
              className="min-w-0 max-w-full flex-1 truncate text-[17px] leading-tight font-semibold tracking-[-0.02em] text-ink transition-opacity hover:opacity-70 sm:text-[19px]"
            >
              {brandName}
            </Link>
          ) : (
            <span className="min-w-0" />
          )}
          <nav aria-label="Preview website navigation" className="flex shrink-0 items-center gap-1 text-sm">
            {(["home", "services"] as const).map((page) => (
              <Link
                key={page}
                href={previewSiteHref(auditId, page)}
                aria-current={sitePage === page ? "page" : undefined}
                className={
                  sitePage === page
                    ? "rounded-full bg-ink px-3 py-1.5 font-medium text-surface"
                    : "rounded-full px-3 py-1.5 text-ink-secondary transition-colors hover:bg-surface-alt hover:text-ink"
                }
              >
                {page === "home" ? "Home" : "Services"}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {sitePage === "services" ? (
        <ServicesSubpage preview={preview} assetsById={assetsById} />
      ) : (
        <>
          {/* hero */}
          <section className="px-6 py-16 text-center sm:py-20">
        {/* Clamp capped + break-word so a long compound (e.g. German
            "Klempnerarbeiten") never clips the right edge in the ~720px After
            column at a 50% split. */}
        {/* FEA-116: the business name IS the headline — a visitor landing here
            should read WHO before WHAT. The model-written line keeps its
            weight as the statement underneath, so nothing is lost, only
            reordered. Size scales with the name's length (brandName.ts) and
            still breaks/hyphenates, so a long "… GmbH & Co. KG" cannot spill
            out of the ~50%-wide split pane. */}
        {brandName && (
          <h1
            className={cn(
              // Size FIRST, line-height after: `cn` runs tailwind-merge, which
              // treats `text-[clamp(...)]` as the font-size/line-height
              // shorthand and silently drops a `leading-*` that precedes it
              // (verified — the display type came out at 1.5 line-height).
              heroBrandNameClass(brandName),
              // No `hyphens-auto` here on purpose: a business's NAME must not
              // be split mid-word ("M. Mustermann sani-tary"). It wraps between
              // words, and only breaks inside a word if a single token is
              // genuinely wider than the column.
              // ISS-037: even the name is capped — three lines of wordmark is
              // the most the hero can carry before it stops being a hero.
              "mx-auto line-clamp-3 max-w-3xl leading-[0.95] font-semibold tracking-[-0.04em] text-ink [overflow-wrap:break-word]"
            )}
          >
            {brandName}
          </h1>
        )}
        <p
          className={cn(
            // ISS-037: model-written, so cap it.
            "mx-auto line-clamp-3 max-w-2xl text-[clamp(1.25rem,2.6vw,1.75rem)] leading-[1.2] font-medium tracking-[-0.02em] text-ink [overflow-wrap:break-word] hyphens-auto",
            brandName ? "mt-5" : "mt-0"
          )}
        >
          {hero.h1}
        </p>
        <p className="mx-auto mt-5 line-clamp-4 max-w-xl text-[17px] leading-relaxed text-ink-secondary [overflow-wrap:break-word]">
          {hero.subline}
        </p>
        <div className="mt-6 flex justify-center">
          {/* hero.cta_text is model-written and can run long — PillButton's
              base classes are single-line/content-width (h-12 whitespace-nowrap),
              which overflows a narrow container (e.g. the ~50%-wide After pane
              in SplitView at mobile widths). Override to wrap + cap at the
              container width instead of spilling past it. */}
          <PillButton
            variant="primary"
            size="lg"
            className="h-auto max-w-full min-h-12 justify-center text-center whitespace-normal break-words"
          >
            {hero.cta_text}
          </PillButton>
        </div>
        {/* ISS-029: always rendered — generated, honest fallback, or placeholder. */}
        <div className="mx-auto mt-10 w-full max-w-2xl">
          <AfterImageSlot
            src={heroAsset?.url ?? null}
            alt={`${header.business_name} hero`}
            assetLabel={heroAsset?.label}
            partialOnly={heroAsset?.partialOnly === true}
            category={hero.image_category}
            meta={imageMeta.hero}
            executionMode={executionMode}
            caption={`${header.business_name} — hero`}
            className="aspect-video w-full"
          />
        </div>
          </section>

          {/* trust bar */}
          {trustEntries.length > 0 && (
        <section className="border-y border-hairline bg-surface-alt px-6 py-4">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-secondary">
            {/* ISS-037: a chip is a chip — one line, capped width. */}
            {trustEntries.map((entry, i) => (
              <span key={i} className="max-w-full truncate">
                {entry}
              </span>
            ))}
          </div>
        </section>
          )}

          {/* services — always exactly 3, as structured cards (never a text wall) */}
          <section className="px-6 py-14 sm:py-16">
        <div className="mx-auto max-w-3xl @container">
          <p className="text-center text-[13px] font-semibold tracking-[0.18em] text-ink-secondary uppercase">
            What we do
          </p>
          <h2 className="mt-2 text-center text-2xl font-semibold tracking-[-0.02em] text-ink">Services</h2>
          {/* ISS-037: `items-stretch` + `h-full` keeps the three cards the same
              height, and the clamps keep ONE long service from setting that
              height for the row. The backend caps these strings at source
              (ISS-036); this is the renderer's own guarantee, so no future
              content path can break the layout. */}
          {/* ISS-037: `@container` + `@md:` so the columns respond to the PANE,
              not the viewport. In SplitView the After pane is ~50% of the
              window, so viewport-keyed `sm:grid-cols-3` forced three ~130px
              columns into it and shredded every word. */}
          <div className="mt-8 grid items-stretch gap-4 @md:grid-cols-3">
            {services.map((service, i) => (
              <div key={i} className="flex h-full flex-col rounded-2xl border border-hairline bg-surface p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-surface tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 line-clamp-2 text-[17px] leading-snug font-semibold text-ink [overflow-wrap:break-word]">
                  {service.title}
                </h3>
                <p className="mt-2 line-clamp-5 text-[14px] leading-relaxed text-ink-secondary [overflow-wrap:break-word]">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
          </section>

          {/* work-proof gallery — AI concepts only (originals get their own block) */}
          {conceptGallery.length > 0 && (
        <section className="bg-surface-alt px-6 py-14 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <p className="text-center text-[13px] font-semibold tracking-[0.18em] text-ink-secondary uppercase">
              How it could look
            </p>
            <h2 className="mt-2 text-center text-2xl font-semibold tracking-[-0.02em] text-ink">Our work</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {conceptGallery.map((item) => {
                const asset = assetsById[item.asset_ref] ?? null;
                // ISS-033: say what the tile depicts, so the gallery reads as a
                // deliberate composition rather than an arbitrary pile.
                const categoryLabel = imageCategoryLabel(item.category);
                return (
                  <div key={item.asset_ref}>
                    <ZoomableAssetImage
                      src={asset?.url ?? null}
                      alt={`${header.business_name} work sample`}
                      label={asset ? asset.label : item.label}
                      executionMode={executionMode}
                      caption={`${header.business_name} — work sample`}
                      className="aspect-[4/3]"
                    />
                    {categoryLabel && (
                      <div className="mt-2">
                        <CategoryChip label={categoryLabel} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
          )}

          {/* FEA-110: retained REAL photos in a dedicated, honestly-labelled block */}
          {originalGallery.length > 0 && (
        <section className="px-6 py-14 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <p className="text-center text-[13px] font-semibold tracking-[0.18em] text-ink-secondary uppercase">
              Credentials &amp; real work
            </p>
            <h2 className="mt-2 text-center text-2xl font-semibold tracking-[-0.02em] text-ink">
              Real photos from your business
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-[14px] leading-relaxed text-ink-secondary">
              Kept from your existing site — genuine, unedited proof of your work, shown as-is.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {originalGallery.map((item) => {
                const asset = assetsById[item.asset_ref] ?? null;
                const isCertificate = asset?.group === "credential";
                const LabelIcon = isCertificate ? Award : Camera;
                const labelText = isCertificate ? "Certificate" : "Real photo";
                return (
                  <figure key={item.asset_ref}>
                    <ZoomableAssetImage
                      src={asset?.url ?? null}
                      alt={`${header.business_name} ${labelText.toLowerCase()}`}
                      label={null}
                      executionMode={executionMode}
                      caption={`${labelText} — kept from your site`}
                      className="aspect-[4/3]"
                    />
                    <figcaption className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-medium text-ink-secondary">
                      <LabelIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      {labelText}
                      {imageCategoryLabel(item.category) && (
                        <CategoryChip label={imageCategoryLabel(item.category)!} className="ml-0.5" />
                      )}
                      {asset?.reason && (
                        <span className="font-normal text-ink-secondary/80">· {asset.reason}</span>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
          )}

          {/* about / team */}
          <section className="px-6 py-14">
        <div className="@container mx-auto max-w-3xl">
          <div className="grid items-center gap-8 @md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold text-ink">About us</h2>
            {/* ISS-037: the About copy is model-written and sits next to a
                fixed-ratio image — an unclamped wall of text would stretch the
                row and leave the picture floating in white space. */}
            <p className="mt-3 line-clamp-[10] text-base leading-relaxed text-ink-secondary [overflow-wrap:break-word]">
              {about_team.text}
            </p>
          </div>
          <AfterImageSlot
            src={teamAsset?.url ?? null}
            alt={`${header.business_name} team`}
            assetLabel={teamAsset?.label}
            partialOnly={teamAsset?.partialOnly === true}
            category={about_team.image_category}
            meta={imageMeta.team}
            executionMode={executionMode}
            caption={`${header.business_name} — team`}
            className="aspect-[4/3]"
          />
          </div>
        </div>
          </section>

          {/* contact */}
          <section className="border-t border-hairline bg-surface-alt px-6 py-14 text-center">
        <h2 className="mx-auto line-clamp-3 max-w-2xl text-xl font-semibold text-ink [overflow-wrap:break-word]">
          {contact.cta}
        </h2>
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="mt-3 inline-flex items-center gap-2 text-body text-accent hover:underline"
          >
            <Phone className="size-4" aria-hidden="true" />
            {contact.phone}
          </a>
        )}
        <p className="mx-auto mt-6 max-w-sm text-sm text-ink-secondary">
          This is a static demonstration of what your page could look like — publishing it for you is the paid
          next step.
        </p>
          </section>

        </>
      )}

      {/* FEA-116: one footer for EVERY page (it used to live inside the home
          branch, so the Services page ended with no name on it at all). The
          business name signs off the page; the legal lines follow when the
          audit actually found them. */}
      <footer className="border-t border-hairline bg-surface-alt px-6 py-10 text-center">
        {brandName && (
          <p className="mx-auto line-clamp-2 max-w-2xl text-[20px] leading-snug font-semibold tracking-[-0.02em] text-ink [overflow-wrap:break-word]">
            {brandName}
          </p>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="mt-2 inline-flex items-center gap-2 text-[15px] text-ink-secondary hover:text-ink"
          >
            <Phone className="size-4" aria-hidden="true" />
            {contact.phone}
          </a>
        )}
        {hasLegalFooter && (
          <div className="mt-4 text-[13px] text-ink-secondary">
            {legal_footer.impressum && (
              <p className="mx-auto line-clamp-3 max-w-2xl [overflow-wrap:break-word]">{legal_footer.impressum}</p>
            )}
            {legal_footer.datenschutz && (
              <p className="mx-auto mt-1 line-clamp-3 max-w-2xl [overflow-wrap:break-word]">
                {legal_footer.datenschutz}
              </p>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
