// F-112: a second, genuinely navigable page inside the optimized-site
// preview. It deliberately reuses PreviewJson's exact three service cards;
// no service copy or schema extension is invented in the UI.
import { Phone } from "lucide-react";

import { AssetImage } from "../report/AssetImage";
import { CategoryChip } from "../report/CategoryChip";
import { imageCategoryLabel } from "../report/imageCategory";
import { PillButton } from "../primitives/PillButton";
import type { PreviewJson } from "../../lib/schemas";
import type { AssetLookup } from "./types";

export type ServicesSubpageProps = {
  preview: PreviewJson;
  assetsById: AssetLookup;
};

export function ServicesSubpage({ preview, assetsById }: ServicesSubpageProps) {
  // FEA-110: show AI concepts here (real originals live in the After home's
  // dedicated "Credentials & real work" block), so the two never mix.
  const conceptGallery = preview.gallery
    .filter((item) => (assetsById[item.asset_ref]?.label ?? item.label) != null)
    .slice(0, 3);

  return (
    <>
      <section className="bg-surface-alt px-6 py-14 text-center sm:py-20">
        <p className="text-[13px] font-semibold tracking-[0.18em] text-ink-secondary uppercase">What we do</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-[clamp(3rem,8vw,5.75rem)] leading-[0.93] font-semibold tracking-[-0.055em] text-ink">
          Services built around your needs
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-body text-ink-secondary">
          Clear scope, straightforward advice, and a direct route to the right service.
        </p>
      </section>

      <section className="px-6 py-14 sm:py-20">
        {/* ISS-037: same guardrails as the home page's cards — equal heights,
            and one long service can never set the height for the row. */}
        {/* The `@container` must be an ANCESTOR of the element using `@md:` —
            a container query never applies to the element that declares it. */}
        <div className="@container mx-auto max-w-3xl">
          <div className="grid items-stretch gap-4 @md:grid-cols-3">
          {preview.services.map((service, index) => (
            <article
              key={`${service.title}-${index}`}
              className="flex h-full flex-col rounded-2xl border border-hairline bg-surface p-5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-surface tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-4 line-clamp-2 text-[17px] leading-snug font-semibold text-ink [overflow-wrap:break-word]">
                {service.title}
              </h2>
              <p className="mt-2 line-clamp-5 text-[14px] leading-relaxed text-ink-secondary [overflow-wrap:break-word]">
                {service.description}
              </p>
            </article>
          ))}
          </div>
        </div>
      </section>

      {conceptGallery.length > 0 && (
        <section className="bg-surface-alt px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-xl font-semibold text-ink">A look at our work</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {conceptGallery.map((item) => {
                const asset = assetsById[item.asset_ref];
                const categoryLabel = imageCategoryLabel(item.category);
                return (
                  <div key={item.asset_ref}>
                    <AssetImage
                      src={asset?.url ?? null}
                      alt={`${preview.header.business_name} service example`}
                      label={asset ? asset.label : item.label}
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

      <section className="border-t border-hairline px-6 py-14 text-center">
        <h2 className="mx-auto line-clamp-3 max-w-2xl text-xl font-semibold text-ink [overflow-wrap:break-word]">
          {preview.contact.cta}
        </h2>
        {preview.contact.phone && (
          <div className="mt-5 flex justify-center">
            <PillButton href={`tel:${preview.contact.phone}`} variant="primary">
              <Phone className="size-4" aria-hidden="true" />
              {preview.contact.phone}
            </PillButton>
          </div>
        )}
      </section>
    </>
  );
}
