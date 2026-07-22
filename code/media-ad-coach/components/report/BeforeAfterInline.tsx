"use client";

// F-072 / FEA-106: the expandable before -> after reveal inside an improved
// ChannelRow — the product's payoff, so the delta must be unmissable.
//   - Text channels show a large, color-coded diff: the reworked line is
//     display-scale with newly added words in the red/rust accent; the quiet
//     "before" line above strikes what was removed; brand-new pieces (subline,
//     CTA, GBP copy, services) are flagged bold near-black under a "New" tag.
//   - Image channels show every generated/enhanced photo LARGE and side by
//     side with the original, each click-to-zoom via ZoomableAssetImage, with
//     the AI concept / Enhanced and LIVE/REPLAY truth badges intact.
// `channel.after` is z.unknown() at the schema level (lib/schemas.ts) — every
// field access stays optional-chained and narrowed only by `channel.id`, per
// docs/CONTRACTS.md's documented after_json shapes. Missing/malformed pieces
// render nothing rather than crashing (F-072 spec).
import * as React from "react";
import { Check } from "lucide-react";

import { ZoomableAssetImage } from "./ZoomableAssetImage";
import { deriveBeforeExcerpt } from "./beforeExcerpt";
import { Eyebrow } from "../primitives/Eyebrow";
import { imageEditFailureCopy, imageGenerationFailureCopy } from "./generationStatus";
import { CategoryChip } from "./CategoryChip";
import { imageCategoryLabel, isSkippedOnPurpose, skippedOnPurposeCopy } from "./imageCategory";
import { diffAfter, diffBefore, diffWords } from "../../lib/client/textDiff";
import type { AssetView } from "../../lib/client/types";
import type { Channel } from "../../lib/schemas";
import { cn } from "@/lib/utils";

export type BeforeAfterInlineProps = {
  channel: Channel;
  assets: AssetView[];
  executionMode?: "LIVE" | "REPLAY" | string | null;
};

// ---------------------------------------------------------------------------
// Text diff primitives
// ---------------------------------------------------------------------------

function DiffText({
  before,
  after,
  mode,
}: {
  before: string;
  after: string;
  mode: "before" | "after";
}) {
  const segments = mode === "before" ? diffBefore(before, after) : diffAfter(before, after);
  return (
    <>
      {segments.map((segment, index) => {
        const space = index > 0 ? " " : "";
        if (segment.kind === "removed") {
          return (
            <React.Fragment key={index}>
              {space}
              <span className="text-ink-secondary/60 line-through decoration-ink-secondary/40">
                {segment.value}
              </span>
            </React.Fragment>
          );
        }
        if (segment.kind === "added") {
          return (
            <React.Fragment key={index}>
              {space}
              <span className="text-destructive">{segment.value}</span>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={index}>
            {space}
            <span>{segment.value}</span>
          </React.Fragment>
        );
      })}
    </>
  );
}

/** A reworked line: quiet struck "before" above, display-scale "after" with
 *  added words in the rust accent — but ONLY when `before` is a genuine prior
 *  version of this line (shares words with `after`). When there is no real
 *  before (e.g. the derived excerpt is an unrelated blob), the struck before is
 *  dropped and the new copy renders clean near-black under a "New" tag, so the
 *  rust accent never paints an entire line that was not actually edited. */
function DiffPair({
  before,
  after,
  size = "lg",
  newTag = "New",
}: {
  before: string | null;
  after: string;
  size?: "lg" | "xl";
  newTag?: string;
}) {
  const hasBefore = Boolean(before && before.trim().length > 0);
  const overlaps = hasBefore && diffWords(before as string, after).some((s) => s.kind === "unchanged");
  const afterSize =
    size === "xl"
      ? "text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.08] tracking-[-0.02em]"
      : "text-[clamp(1.375rem,1.05rem+1.1vw,1.875rem)] leading-[1.15] tracking-[-0.01em]";

  if (!overlaps) {
    return (
      <div>
        <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-surface uppercase">
          {newTag}
        </span>
        <p className={cn("mt-2 font-semibold text-ink", afterSize)}>{after}</p>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Before</Eyebrow>
      <p className="mt-1.5 text-[18px] leading-snug text-ink-secondary/70">
        <DiffText before={before as string} after={after} mode="before" />
      </p>
      <Eyebrow className="mt-5">After</Eyebrow>
      <p className={cn("mt-1.5 font-semibold text-ink", afterSize)}>
        <DiffText before={before as string} after={after} mode="after" />
      </p>
    </div>
  );
}

/** A brand-new piece of content (no meaningful "before") — bold, near-black,
 *  larger, tagged so it reads as newly created. */
function NewContentBlock({
  tag = "New",
  size = "md",
  children,
}: {
  tag?: string;
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-surface uppercase">
        {tag}
      </span>
      <div
        className={cn(
          "mt-2 font-semibold text-ink",
          size === "md"
            ? "text-[clamp(1.125rem,1rem+0.6vw,1.5rem)] leading-snug"
            : "text-[18px] leading-normal"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function NewCtaPill({ text }: { text: string }) {
  return (
    <div className="mt-5">
      <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-surface uppercase">
        New CTA
      </span>
      <div className="mt-2">
        <span className="inline-flex rounded-full bg-ink px-5 py-2.5 text-[16px] font-semibold text-surface">
          {text}
        </span>
      </div>
    </div>
  );
}

function Rationale({ text }: { text?: string | null }) {
  if (!text) return null;
  return <p className="mt-6 border-t border-hairline pt-4 text-[15px] text-ink-secondary italic">{text}</p>;
}

// ---------------------------------------------------------------------------
// Text-channel renderers — one per RewriteOutput.after shape (lib/schemas.ts)
// ---------------------------------------------------------------------------

type UnknownAfter = Record<string, unknown> | undefined;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function renderTextAfterBody(
  channelId: string,
  fields: UnknownAfter,
  before: string | null
): React.ReactNode {
  switch (channelId) {
    case "hero_headline": {
      const h1 = str(fields?.h1);
      const subline = str(fields?.subline);
      const cta = str(fields?.cta_text);
      if (!h1 && !subline && !cta) return null;
      return (
        <>
          {h1 && <DiffPair before={before} after={h1} size="xl" newTag="New headline" />}
          {subline && <NewContentBlock tag="New subline">{subline}</NewContentBlock>}
          {cta && <NewCtaPill text={cta} />}
        </>
      );
    }
    case "business_description": {
      const about = str(fields?.about_paragraph);
      const de = str(fields?.gbp_description_de);
      const en = str(fields?.gbp_description_en);
      if (!about && !de && !en) return null;
      return (
        <>
          {about && <DiffPair before={before} after={about} size="lg" newTag="New description" />}
          {de && (
            <NewContentBlock tag="New · GBP (DE)" size="sm">
              {de}
            </NewContentBlock>
          )}
          {en && (
            <NewContentBlock tag="New · GBP (EN)" size="sm">
              {en}
            </NewContentBlock>
          )}
        </>
      );
    }
    case "services_copy": {
      const services = Array.isArray(fields?.services) ? (fields!.services as unknown[]) : null;
      if (!services || services.length === 0) return null;
      return (
        <NewContentBlock tag="New services">
          <ul className="space-y-4">
            {services.map((entry, i) => {
              const svc = asRecord(entry);
              const name = str(svc?.service_name);
              const description = str(svc?.description);
              if (!name && !description) return null;
              return (
                <li key={i}>
                  {name && <p className="text-[19px] font-semibold text-ink">{name}</p>}
                  {description && (
                    <p className="mt-1 text-[16px] leading-relaxed font-normal text-ink-secondary">
                      {description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </NewContentBlock>
      );
    }
    case "cta_contact": {
      const cta = str(fields?.cta_text);
      const contact = str(fields?.contact_block_text);
      if (!cta && !contact) return null;
      return (
        <>
          {cta && <NewCtaPill text={cta} />}
          {contact && (
            <NewContentBlock tag="New contact" size="sm">
              {contact}
            </NewContentBlock>
          )}
        </>
      );
    }
    case "legal_footer": {
      const checklist = Array.isArray(fields?.checklist) ? (fields!.checklist as unknown[]) : null;
      const footerText = str(fields?.footer_text);
      if ((!checklist || checklist.length === 0) && !footerText) return null;
      return (
        <NewContentBlock tag="New legal" size="sm">
          {checklist && checklist.length > 0 && (
            <ul className="list-disc space-y-1.5 pl-5">
              {checklist.map((item, i) => (
                <li key={i} className="font-normal text-ink-secondary">
                  {String(item)}
                </li>
              ))}
            </ul>
          )}
          {footerText && <p className="mt-3 font-normal text-ink-secondary">{footerText}</p>}
        </NewContentBlock>
      );
    }
    case "platform_consistency": {
      const name = str(fields?.business_name);
      const phone = str(fields?.phone);
      const address = str(fields?.address);
      const line = [name, phone, address].filter((v): v is string => Boolean(v)).join(" · ");
      if (!line) return null;
      return <NewContentBlock tag="Consistent NAP" size="sm">{line}</NewContentBlock>;
    }
    default:
      return null;
  }
}

function TextChannelReveal({ channel }: { channel: Channel }) {
  const after = asRecord(channel.after);
  const fields = asRecord(after?.after);
  const before =
    (typeof after?.before_excerpt === "string" ? after.before_excerpt : null) ??
    deriveBeforeExcerpt(channel.before);
  const rationale = typeof after?.rationale_one_liner === "string" ? after.rationale_one_liner : null;
  const body = renderTextAfterBody(channel.id, fields, before);

  if (!body) return null;

  return (
    <div>
      {body}
      <Rationale text={rationale} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image-channel renderers
// ---------------------------------------------------------------------------

function ShotBriefChecklist({ brief }: { brief: string }) {
  const lines = brief.split("\n").filter((l) => l.trim().length > 0);
  return (
    <div className="mt-6 border-t border-hairline pt-4">
      <Eyebrow>How to replace this with a real photo</Eyebrow>
      <ul className="mt-2 space-y-1 text-[15px] text-ink">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function ImageCaption({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[14px] font-medium text-ink">{children}</p>;
}

function originalAssetRefs(before: unknown): string[] {
  const record = asRecord(before);
  if (!record) return [];
  if (Array.isArray(record.asset_refs)) return (record.asset_refs as unknown[]).map(String);
  if (typeof record.asset_ref === "string") return [record.asset_ref];
  return [];
}

/** Match by db `id` first, then fall back to the fixture-derived `ref`
 *  (lib/client/assets.ts#deriveAssetRef) — REPLAY re-inserts fixture assets
 *  under fresh uuids, but channel before_json / after_json asset references
 *  still point at the fixture's original ids. */
/** FEA-115: exported so ChannelRow can resolve a partial frame the same way
 *  the full reveal does (id first, then the fixture-derived `ref`). */
export function buildAssetLookup(assets: AssetView[]): (key: string | null | undefined) => AssetView | undefined {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const assetByRef = new Map(
    assets.filter((a): a is AssetView & { ref: string } => Boolean(a.ref)).map((a) => [a.ref, a])
  );
  return (key) => {
    if (!key) return undefined;
    return assetById.get(key) ?? assetByRef.get(key);
  };
}

function GeneratedImageReveal({
  channel,
  assets,
  executionMode,
}: {
  channel: Channel;
  assets: AssetView[];
  executionMode?: "LIVE" | "REPLAY" | string | null;
}) {
  const after = asRecord(channel.after);
  const shotBrief = typeof after?.shot_brief === "string" ? after.shot_brief : null;
  const generatedAssetId = typeof after?.generated_asset_id === "string" ? after.generated_asset_id : null;
  const bestExistingAssetId =
    typeof after?.best_existing_asset_id === "string" ? after.best_existing_asset_id : null;
  const generationError = typeof after?.generation_error === "string" ? after.generation_error : null;
  // ISS-033 / FEA-114: the planner can DECIDE not to generate, because the
  // business's own photos already cover this category. That is a good outcome
  // with no image attached — before this it fell through every branch below and
  // rendered an empty panel, which reads as a failure.
  const skipped = isSkippedOnPurpose(after);
  const contentCategory = after?.content_category;

  const resolveAsset = buildAssetLookup(assets);
  const generatedAsset = resolveAsset(generatedAssetId);
  const originals = originalAssetRefs(channel.before)
    .map((id) => resolveAsset(id))
    .filter((a): a is AssetView => Boolean(a));

  const failed = !generatedAsset && Boolean(generationError);

  return (
    <div>
      {generatedAsset ? (
        <div>
          {/* The generated concept is the payoff — render it as the hero, full
              width and large, with an explicit AFTER label. */}
          <Eyebrow>{originals.length > 0 ? "After — AI concept" : "New — AI concept"}</Eyebrow>
          <ZoomableAssetImage
            src={generatedAsset.url}
            alt="AI-generated concept photo"
            label="ai_concept"
            executionMode={executionMode}
            caption="AI-generated concept photo"
            className="mt-2 aspect-[3/2] w-full"
          />
          {originals.length > 0 && (
            <div className="mt-6">
              <Eyebrow>Before — what you have today</Eyebrow>
              <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {originals.map((asset) => (
                  <ZoomableAssetImage
                    key={asset.id}
                    src={asset.url}
                    alt="Original photo"
                    executionMode={executionMode}
                    caption="Original photo"
                    className="aspect-square"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : skipped ? (
        <SkippedOnPurposeNote category={contentCategory} />
      ) : failed ? (
        // ISS-030: whatever reaches here is already the redacted kind token
        // (the server strips the raw provider text before serializing) — this
        // maps it to allowlisted copy and never echoes its input either way.
        <p className="overflow-hidden text-[15px] break-words text-ink-secondary">
          {imageGenerationFailureCopy(generationError)} No image is shown here rather than
          showing something fake.
          {bestExistingAssetId && " We recommend using your best real photo for now."}
        </p>
      ) : null}
      {shotBrief && <ShotBriefChecklist brief={shotBrief} />}
    </div>
  );
}

/** ISS-033: a deliberate skip, stated as the positive decision it is. */
function SkippedOnPurposeNote({ category }: { category: unknown }) {
  const { title, body } = skippedOnPurposeCopy(category);
  const label = imageCategoryLabel(category);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-alt px-4 py-3.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-success"
      >
        <Check className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[15px] font-medium text-ink">{title}</p>
          {label && <CategoryChip label={label} />}
        </div>
        <p className="mt-1 overflow-hidden text-[14px] leading-relaxed break-words text-ink-secondary">
          {body}
        </p>
      </div>
    </div>
  );
}

function ImageFixesReveal({
  channel,
  assets,
  executionMode,
}: {
  channel: Channel;
  assets: AssetView[];
  executionMode?: "LIVE" | "REPLAY" | string | null;
}) {
  const after = asRecord(channel.after);
  const shotBrief = typeof after?.shot_brief === "string" ? after.shot_brief : null;
  const fixes = Array.isArray(after?.fixes) ? (after!.fixes as unknown[]) : [];
  const sourceAssetId = typeof after?.source_asset_id === "string" ? after.source_asset_id : null;
  const enhancedAssetId = typeof after?.enhanced_asset_id === "string" ? after.enhanced_asset_id : null;
  const editError = typeof after?.edit_error === "string" ? after.edit_error : null;
  const resolveAsset = buildAssetLookup(assets);
  const sourceAsset = resolveAsset(sourceAssetId);
  const enhancedAsset = resolveAsset(enhancedAssetId);

  return (
    <div>
      {enhancedAsset && (
        <div className="grid gap-4 sm:grid-cols-2">
          <figure>
            <ZoomableAssetImage
              src={sourceAsset?.url ?? null}
              alt="Original business photo"
              className="aspect-[4/3]"
              executionMode={executionMode}
              caption="Original business photo"
            />
            <ImageCaption>Original</ImageCaption>
          </figure>
          <figure>
            <ZoomableAssetImage
              src={enhancedAsset.url}
              alt="Enhanced business photo"
              label="enhanced"
              className="aspect-[4/3]"
              executionMode={executionMode}
              caption="Enhanced — relit &amp; recropped"
            />
            <ImageCaption>Relit &amp; recropped</ImageCaption>
          </figure>
        </div>
      )}
      {!enhancedAsset && editError && (
        // ISS-030: same rule as generation_error — a redacted kind token in,
        // allowlisted copy out.
        <p className="overflow-hidden text-[15px] break-words text-ink-secondary">
          {imageEditFailureCopy(editError)} The evidence-backed fix instructions remain
          available below.
        </p>
      )}
      {fixes.length > 0 && (
        <ul className="mt-4 space-y-3">
          {fixes.map((entry, i) => {
            const fix = asRecord(entry);
            const assetId = typeof fix?.asset_id === "string" ? fix.asset_id : null;
            const instruction = typeof fix?.instruction === "string" ? fix.instruction : null;
            if (!instruction) return null;
            const asset = resolveAsset(assetId);
            return (
              <li key={i} className="flex items-start gap-4 border-t border-hairline pt-3 first:border-t-0">
                {asset && (
                  <div className="w-28 shrink-0 sm:w-36">
                    <ZoomableAssetImage
                      src={asset.url}
                      alt="Flagged photo"
                      label={asset.label as "ai_concept" | "enhanced" | null}
                      className="aspect-square"
                      executionMode={executionMode}
                    />
                  </div>
                )}
                <p className="text-[15px] text-ink">{instruction}</p>
              </li>
            );
          })}
        </ul>
      )}
      {shotBrief && <ShotBriefChecklist brief={shotBrief} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const GENERATED_IMAGE_CHANNEL_IDS = new Set(["hero_image", "team_image", "work_proof_images"]);

export function BeforeAfterInline({ channel, assets, executionMode }: BeforeAfterInlineProps) {
  if (channel.id === "image_fixes") {
    return <ImageFixesReveal channel={channel} assets={assets} executionMode={executionMode} />;
  }
  if (GENERATED_IMAGE_CHANNEL_IDS.has(channel.id)) {
    return <GeneratedImageReveal channel={channel} assets={assets} executionMode={executionMode} />;
  }
  return <TextChannelReveal channel={channel} />;
}
