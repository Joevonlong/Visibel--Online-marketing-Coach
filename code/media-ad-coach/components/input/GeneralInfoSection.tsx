// F-061 / FEA-104: Section A — General information. Apple-style grouped card
// with hairline dividers between rows. Business type is an OPEN multi-select:
// ~10 popular quick-pick chips plus free-text custom entries. It is not the
// frozen `Trade` enum directly — the page derives one canonical `trade` value
// from the selection (deriveTrade) and encodes the full label list into the
// free-text `background` string (formatBusinessTypes) so lib/schemas.ts stays
// FROZEN while every chosen/typed type still reaches the pipeline.
import * as React from "react";

import { Card } from "@/components/primitives/Card";
import { Chip, RemovableChip } from "@/components/primitives/Chip";
import { FieldLabel, TextInput } from "@/components/primitives/Field";
import type { Trade } from "@/lib/schemas";

/** Popular local-business categories. `trade` maps each quick-pick to the
 *  frozen Trade enum (lib/schemas.ts) for the pipeline's trade-specific logic;
 *  categories with no dedicated enum value map to "other" and carry their real
 *  label through `background`. Order here is display order. */
const BUSINESS_TYPE_OPTIONS: { label: string; trade: Trade }[] = [
  { label: "Plumber", trade: "plumber" },
  { label: "Electrician", trade: "electrician" },
  { label: "Roofer", trade: "roofing" },
  { label: "Handyman", trade: "handyman" },
  { label: "Doctor / Clinic", trade: "doctor" },
  { label: "Restaurant / Café", trade: "other" },
  { label: "Retail shop", trade: "other" },
  { label: "Beauty / Salon", trade: "other" },
  { label: "Fitness / Gym", trade: "other" },
  { label: "Auto repair", trade: "other" },
];

const QUICK_PICK_LABELS = new Set(BUSINESS_TYPE_OPTIONS.map((o) => o.label));

/** The single canonical `Trade` enum value for the pipeline: the first
 *  selected quick-pick that maps to a real trade, otherwise "other". Null only
 *  when nothing is selected (drives the intake gate). */
export function deriveTrade(businessTypes: string[]): Trade | null {
  if (businessTypes.length === 0) return null;
  for (const label of businessTypes) {
    const match = BUSINESS_TYPE_OPTIONS.find((o) => o.label === label);
    if (match && match.trade !== "other") return match.trade;
  }
  return "other";
}

/** The human-readable business-type line encoded into `background` so the
 *  full multi-select + custom text reaches the audit pipeline unchanged. */
export function formatBusinessTypes(businessTypes: string[]): string | null {
  const cleaned = businessTypes.map((t) => t.trim()).filter(Boolean);
  return cleaned.length > 0 ? `Business type: ${cleaned.join(", ")}.` : null;
}

export type GeneralInfo = {
  brandName: string;
  /** Selected quick-pick labels + committed free-text custom entries. */
  businessTypes: string[];
  background: string;
  city: string;
};

export type GeneralInfoSectionProps = {
  value: GeneralInfo;
  onChange: (value: GeneralInfo) => void;
};

export function GeneralInfoSection({ value, onChange }: GeneralInfoSectionProps) {
  const update = (patch: Partial<GeneralInfo>) => onChange({ ...value, ...patch });

  const [draft, setDraft] = React.useState("");
  const customEntries = value.businessTypes.filter((t) => !QUICK_PICK_LABELS.has(t));

  const toggleType = (label: string) => {
    update({
      businessTypes: value.businessTypes.includes(label)
        ? value.businessTypes.filter((t) => t !== label)
        : [...value.businessTypes, label],
    });
  };

  const removeType = (label: string) => {
    update({ businessTypes: value.businessTypes.filter((t) => t !== label) });
  };

  const addCustom = () => {
    const typed = draft.trim();
    if (!typed) return;
    const already = value.businessTypes.some((t) => t.toLowerCase() === typed.toLowerCase());
    if (!already) {
      // Re-use a quick-pick's canonical casing if the typed text matches one.
      const canonical =
        BUSINESS_TYPE_OPTIONS.find((o) => o.label.toLowerCase() === typed.toLowerCase())?.label ??
        typed;
      update({ businessTypes: [...value.businessTypes, canonical] });
    }
    setDraft("");
  };

  return (
    <Card variant="outlined" className="divide-y divide-hairline p-0">
      <div className="p-6">
        <FieldLabel htmlFor="brand-name">Brand name</FieldLabel>
        <TextInput
          id="brand-name"
          value={value.brandName}
          onChange={(event) => update({ brandName: event.target.value })}
          placeholder="e.g. Meier Sanitär"
        />
      </div>

      <div className="p-6">
        <FieldLabel>What kind of business is this?</FieldLabel>
        <p className="-mt-1 mb-3 text-[13px] text-ink-secondary">
          Pick any that fit — add your own if it&rsquo;s not listed.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Business type">
          {BUSINESS_TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              selected={value.businessTypes.includes(option.label)}
              onClick={() => toggleType(option.label)}
            >
              {option.label}
            </Chip>
          ))}
        </div>

        {customEntries.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {customEntries.map((label) => (
              <RemovableChip
                key={label}
                onRemove={() => removeType(label)}
                removeLabel={`Remove ${label}`}
              >
                {label}
              </RemovableChip>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <TextInput
            className="flex-1"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add another type (e.g. Bakery)"
            aria-label="Add a custom business type"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!draft.trim()}
            className="shrink-0 text-[15px] font-medium text-ink underline decoration-hairline underline-offset-4 transition-colors hover:decoration-ink disabled:opacity-40 disabled:hover:decoration-hairline"
          >
            Add
          </button>
        </div>
      </div>

      <div className="p-6">
        <FieldLabel htmlFor="background" optional>
          One-line description
        </FieldLabel>
        <TextInput
          id="background"
          value={value.background}
          onChange={(event) => update({ background: event.target.value })}
          placeholder="What do you do best?"
        />
      </div>

      <div className="p-6">
        <FieldLabel htmlFor="city" optional>
          City
        </FieldLabel>
        <TextInput
          id="city"
          value={value.city}
          onChange={(event) => update({ city: event.target.value })}
          placeholder="e.g. Berlin"
        />
      </div>
    </Card>
  );
}
