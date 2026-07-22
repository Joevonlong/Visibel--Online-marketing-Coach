// F-062: Section B — online presence. One labeled URL field per surface plus
// a repeatable "other" list (Check24 / misc platforms). Empty fields are
// allowed and meaningful (BusinessInput.presence.* is entirely optional) —
// validation only fires for fields the user actually typed into.
import * as React from "react";
import { BookOpen, Globe, Link2, MapPin, X } from "lucide-react";

import { Card } from "@/components/primitives/Card";
import { FieldLabel, TextInput } from "@/components/primitives/Field";

export type PresenceValue = {
  website: string;
  maps: string;
  yellowPages: string;
  other: string[];
};

export type PresenceSectionProps = {
  value: PresenceValue;
  onChange: (value: PresenceValue) => void;
};

/** Prepend https:// when the user typed a bare domain (e.g. "example.com")
 *  so it validates and posts the same way "https://example.com" would. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Empty is always valid — a missing link is a finding, not an input error. */
export function isValidHttpUrl(raw: string): boolean {
  if (raw.trim().length === 0) return true;
  try {
    const url = new URL(normalizeUrl(raw));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function UrlField({
  id,
  icon,
  label,
  value,
  placeholder,
  onChange,
  onRemove,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  onRemove?: () => void;
}) {
  const [touched, setTouched] = React.useState(false);
  const valid = isValidHttpUrl(value);

  return (
    <div>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id} icon={icon}>
          {label}
        </FieldLabel>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="text-ink-secondary/70 transition-colors duration-200 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <TextInput
        id={id}
        inputMode="url"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={touched && !valid}
      />
      {touched && !valid && (
        <p className="mt-2 text-[14px] text-destructive">
          That doesn&apos;t look like a valid URL yet — double check it.
        </p>
      )}
    </div>
  );
}

export function PresenceSection({ value, onChange }: PresenceSectionProps) {
  const update = (patch: Partial<PresenceValue>) => onChange({ ...value, ...patch });

  const updateOther = (index: number, next: string) => {
    const other = [...value.other];
    other[index] = next;
    update({ other });
  };

  const removeOther = (index: number) => {
    update({ other: value.other.filter((_, i) => i !== index) });
  };

  return (
    <Card variant="outlined" className="divide-y divide-hairline p-0">
      <div className="p-6">
        <UrlField
          id="presence-website"
          icon={<Globe className="size-4" aria-hidden="true" />}
          label="Business website"
          value={value.website}
          placeholder="https://your-business.com"
          onChange={(next) => update({ website: next })}
        />
      </div>

      <div className="p-6">
        <UrlField
          id="presence-maps"
          icon={<MapPin className="size-4" aria-hidden="true" />}
          label="Google Maps"
          value={value.maps}
          placeholder="https://maps.google.com/..."
          onChange={(next) => update({ maps: next })}
        />
      </div>

      <div className="p-6">
        <UrlField
          id="presence-yellow-pages"
          icon={<BookOpen className="size-4" aria-hidden="true" />}
          label="Yellow Pages (Gelbe Seiten)"
          value={value.yellowPages}
          placeholder="https://gelbeseiten.de/..."
          onChange={(next) => update({ yellowPages: next })}
        />
      </div>

      {value.other.map((entry, index) => (
        <div className="p-6" key={index}>
          <UrlField
            id={`presence-other-${index}`}
            icon={<Link2 className="size-4" aria-hidden="true" />}
            label={`Other platform (e.g. Check24) #${index + 1}`}
            value={entry}
            placeholder="https://check24.de/..."
            onChange={(next) => updateOther(index, next)}
            onRemove={() => removeOther(index)}
          />
        </div>
      ))}

      <div className="p-6">
        <button
          type="button"
          onClick={() => update({ other: [...value.other, ""] })}
          className="text-[15px] font-medium text-ink underline decoration-hairline underline-offset-4 transition-colors hover:decoration-ink"
        >
          + Add another
        </button>
      </div>
    </Card>
  );
}
