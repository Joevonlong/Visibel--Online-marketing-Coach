// F-064: /audit/new — the intake/config form. Desktop is a deliberate
// two-column layout: the form sections (Sections A/B/C) beside a sticky
// guidance rail (what you'll get + a live readiness checklist), with a
// sticky pill CTA pinned to the bottom. Submit flow is unchanged: build
// BusinessInput -> createAudit -> uploadAssets (if any files) -> startAnalyze
// -> route to /audit/[id].
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Card } from "@/components/primitives/Card";
import { Eyebrow } from "@/components/primitives/Eyebrow";
import { Nav } from "@/components/primitives/Nav";
import { PillButton } from "@/components/primitives/PillButton";
import {
  GeneralInfoSection,
  deriveTrade,
  formatBusinessTypes,
  type GeneralInfo,
} from "@/components/input/GeneralInfoSection";
import {
  PresenceSection,
  type PresenceValue,
  isValidHttpUrl,
  normalizeUrl,
} from "@/components/input/PresenceSection";
import { AttachmentsSection, type AttachmentsValue } from "@/components/input/AttachmentsSection";
import { createAudit, startAnalyze, uploadAssets } from "@/lib/client/api";
import { safeUiText } from "@/lib/client/screenshotStatus";
import type { BusinessInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const initialGeneral: GeneralInfo = { brandName: "", businessTypes: [], background: "", city: "" };
const initialPresence: PresenceValue = { website: "", maps: "", yellowPages: "", other: [] };
const initialAttachments: AttachmentsValue = { pastedText: "", images: [], gbpScreenshots: [] };

function GroupHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="grid gap-1 border-t border-hairline pt-6 sm:grid-cols-[8rem_1fr] sm:items-baseline">
      <Eyebrow className="tracking-[0.12em]">{eyebrow}</Eyebrow>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
    </div>
  );
}

/** Validates the whole form; returns a single calm message or null when
 *  ready to submit. Checked in priority order: malformed URLs first (most
 *  specific), then the "at least one signal" gate, then the required
 *  BusinessInput basics. */
function validateForm(
  general: GeneralInfo,
  presence: PresenceValue,
  attachments: AttachmentsValue
): string | null {
  const urlFields: [string, string][] = [
    ["Business website", presence.website],
    ["Google Maps", presence.maps],
    ["Yellow Pages", presence.yellowPages],
    ...presence.other.map((entry, index) => [`Other platform #${index + 1}`, entry] as [string, string]),
  ];
  for (const [label, raw] of urlFields) {
    if (raw.trim().length > 0 && !isValidHttpUrl(raw)) {
      return `${label} doesn't look like a valid URL — fix it before continuing.`;
    }
  }

  const hasPresence = Boolean(
    presence.website.trim() ||
      presence.maps.trim() ||
      presence.yellowPages.trim() ||
      presence.other.some((entry) => entry.trim().length > 0)
  );
  const hasPastedText = attachments.pastedText.trim().length > 0;
  const hasImages = attachments.images.length > 0;

  if (!hasPresence && !hasPastedText && !hasImages) {
    return "Add at least one link, some pasted text, or a photo before we can check your business.";
  }

  if (!general.brandName.trim()) {
    return "Add a brand name so we know who we're scoring.";
  }
  if (general.businessTypes.length === 0) {
    return "Pick or add at least one business type so we know what we're scoring.";
  }

  return null;
}

/** One row of the readiness checklist in the guidance rail. */
function ReadyItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ease-out",
          done ? "border-success bg-success text-success-foreground" : "border-hairline text-transparent"
        )}
      >
        <Check className="size-3" />
      </span>
      <span className={cn("text-[14px]", done ? "text-ink" : "text-ink-secondary")}>{children}</span>
    </li>
  );
}

const WHAT_YOU_GET = [
  { title: "A visibility score", body: "Text and images scored out of 100 against a fixed rubric." },
  { title: "Prioritized findings", body: "The exact quotes and photos costing you trust, ranked." },
  { title: "One-click fixes", body: "Rewritten copy and concept imagery, with a Before / After." },
] as const;

export default function NewAuditPage() {
  const router = useRouter();

  const [general, setGeneral] = React.useState<GeneralInfo>(initialGeneral);
  const [presence, setPresence] = React.useState<PresenceValue>(initialPresence);
  const [attachments, setAttachments] = React.useState<AttachmentsValue>(initialAttachments);

  const [gateMessage, setGateMessage] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const hasSignal = Boolean(
    presence.website.trim() ||
      presence.maps.trim() ||
      presence.yellowPages.trim() ||
      presence.other.some((entry) => entry.trim().length > 0) ||
      attachments.pastedText.trim() ||
      attachments.images.length > 0
  );
  const hasBrand = general.brandName.trim().length > 0;
  const hasTrade = general.businessTypes.length > 0;

  async function handleSubmit() {
    const message = validateForm(general, presence, attachments);
    if (message) {
      setGateMessage(message);
      setSubmitError(null);
      return;
    }
    // validateForm() guarantees a non-empty selection past this point;
    // deriveTrade returns the canonical Trade enum (never null here), and the
    // full multi-select + custom list is carried through `background` below so
    // lib/schemas.ts stays frozen.
    const trade = deriveTrade(general.businessTypes);
    if (!trade) return;

    const typeLine = formatBusinessTypes(general.businessTypes);
    const description = general.background.trim();
    const backgroundComposed = [typeLine, description].filter(Boolean).join(" ");

    setGateMessage(null);
    setSubmitError(null);
    setSubmitting(true);

    try {
      const otherLinks = presence.other
        .map((entry) => normalizeUrl(entry.trim()))
        .filter((entry) => entry.length > 0);

      // Every optional field is omitted entirely when empty — BusinessInput
      // uses z.string().url().optional(), which rejects "" outright.
      const businessInput: BusinessInput = {
        brand_name: general.brandName.trim(),
        trade,
        presence: {
          ...(presence.website.trim() ? { website: normalizeUrl(presence.website.trim()) } : {}),
          ...(presence.maps.trim() ? { maps: normalizeUrl(presence.maps.trim()) } : {}),
          ...(presence.yellowPages.trim()
            ? { yellow_pages: normalizeUrl(presence.yellowPages.trim()) }
            : {}),
          ...(otherLinks.length > 0 ? { other: otherLinks } : {}),
        },
        ...(backgroundComposed ? { background: backgroundComposed } : {}),
        ...(general.city.trim() ? { city: general.city.trim() } : {}),
        ...(attachments.pastedText.trim() ? { pasted_text: attachments.pastedText.trim() } : {}),
      };

      const hasAttachmentFiles = attachments.images.length > 0 || attachments.gbpScreenshots.length > 0;

      const { auditId } = await createAudit({
        ...businessInput,
        ...(hasAttachmentFiles ? { has_attachments: true } : {}),
      });

      if (attachments.images.length > 0) {
        await uploadAssets(auditId, attachments.images, "uploaded_image");
      }
      if (attachments.gbpScreenshots.length > 0) {
        await uploadAssets(auditId, attachments.gbpScreenshots, "gbp_screenshot");
      }

      await startAnalyze(auditId);

      router.push(`/audit/${auditId}`);
    } catch (error) {
      // ISS-023: never render a raw exception message verbatim.
      if (error) console.warn("[audit/new] submit failed:", error);
      setSubmitError(
        (error instanceof Error ? safeUiText(error.message) : null) ??
          "Something went wrong — please try again."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface pb-40">
      <Nav wordmark="Visibel" href="/">
        <a
          href="/history"
          className="text-[14px] font-medium text-ink-secondary transition-colors duration-200 ease-out hover:text-ink"
        >
          History
        </a>
      </Nav>

      <main className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <header className="mb-14 max-w-2xl">
          <Eyebrow>New audit</Eyebrow>
          <h1 className="mt-4 text-[clamp(2.75rem,7vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-ink">
            Show us what customers see.
          </h1>
          <p className="mt-6 max-w-xl text-[19px] leading-8 text-ink-secondary">
            Add the basics and at least one link, text sample, or image. Missing details become
            useful findings.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
          <div className="space-y-14">
            <div className="space-y-5">
              <GroupHeading eyebrow="Section A" title="General information" />
              <GeneralInfoSection value={general} onChange={setGeneral} />
            </div>

            <div className="space-y-5">
              <GroupHeading eyebrow="Section B" title="Where customers find you" />
              <PresenceSection value={presence} onChange={setPresence} />
            </div>

            <div className="space-y-5">
              <GroupHeading eyebrow="Section C" title="Attachments" />
              <AttachmentsSection value={attachments} onChange={setAttachments} />
            </div>
          </div>

          <aside className="lg:sticky lg:top-[92px] lg:self-start">
            <Card variant="filled" className="space-y-7">
              <div>
                <Eyebrow>What you&rsquo;ll get</Eyebrow>
                <ul className="mt-4 space-y-4">
                  {WHAT_YOU_GET.map((item) => (
                    <li key={item.title}>
                      <p className="text-[15px] font-semibold text-ink">{item.title}</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-ink-secondary">{item.body}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-hairline pt-6">
                <Eyebrow>Ready to check</Eyebrow>
                <ul className="mt-4 space-y-3">
                  <ReadyItem done={hasBrand}>Brand name</ReadyItem>
                  <ReadyItem done={hasTrade}>Business type</ReadyItem>
                  <ReadyItem done={hasSignal}>At least one link, text, or photo</ReadyItem>
                </ul>
              </div>
            </Card>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/80 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p
            className={cn(
              "overflow-hidden text-[14px] break-words",
              submitError ? "text-destructive" : "text-ink-secondary"
            )}
            role="status"
          >
            {submitError ?? gateMessage ?? "We’ll score your online presence in under a minute."}
          </p>
          <PillButton
            size="lg"
            className="w-full sm:w-auto"
            loading={submitting}
            onClick={handleSubmit}
          >
            Check my business
          </PillButton>
        </div>
      </div>
    </div>
  );
}
