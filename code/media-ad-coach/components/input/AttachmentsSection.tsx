// F-063: Section C — attachments. Pasted text (maps to BusinessInput.
// pasted_text) + an image dropzone mirroring the /assets route's limits
// (jpeg/png/webp, <=10MB, <=10 files), plus a quiet <details> disclosure for
// GBP screenshots that upload separately with kind "gbp_screenshot".
import * as React from "react";
import { Camera, Upload, X } from "lucide-react";

import { Card } from "@/components/primitives/Card";
import { FieldLabel, TextArea } from "@/components/primitives/Field";
import { cn } from "@/lib/utils";

export type AttachmentsValue = {
  pastedText: string;
  images: File[];
  gbpScreenshots: File[];
};

export type AttachmentsSectionProps = {
  value: AttachmentsValue;
  onChange: (value: AttachmentsValue) => void;
};

/** Mirrors app/api/audits/[id]/assets/route.ts ALLOWED_MIME_EXT / MAX_BYTES / MAX_FILES. */
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 10;

function describeRejection(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return `${file.name} isn't a JPEG, PNG, or WEBP — skipped.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is over 10MB — skipped.`;
  }
  return null;
}

function ThumbnailGrid({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  const urls = React.useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  React.useEffect(() => {
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [urls]);

  if (files.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className="group relative aspect-square overflow-hidden rounded-lg bg-surface-alt"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, next/image can't optimize File objects */}
          <img src={urls[index]} alt={file.name} className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove ${file.name}`}
            className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-ink/80 text-surface opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Dropzone({
  label,
  hint,
  files,
  maxFiles,
  inputId,
  onFilesAdded,
  onRemove,
}: {
  label: string;
  hint: string;
  files: File[];
  maxFiles: number;
  inputId: string;
  onFilesAdded: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const handleFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const accepted: File[] = [];
    const notes: string[] = [];

    for (const file of list) {
      const rejection = describeRejection(file);
      if (rejection) {
        notes.push(rejection);
        continue;
      }
      accepted.push(file);
    }

    const room = Math.max(0, maxFiles - files.length);
    const toAdd = accepted.slice(0, room);
    if (accepted.length > toAdd.length) {
      notes.push(`Only ${maxFiles} images allowed — the rest were skipped.`);
    }

    setMessage(notes.length > 0 ? notes.join(" ") : null);
    if (toAdd.length > 0) onFilesAdded(toAdd);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (event.dataTransfer.files.length > 0) handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-surface-alt px-6 py-9 text-center transition-colors duration-200 ease-out",
          dragActive && "border-ink bg-surface"
        )}
      >
        <Upload className="size-5 text-ink-secondary" aria-hidden="true" />
        <p className="text-[15px] font-medium text-ink">{label}</p>
        <p className="text-[14px] text-ink-secondary">{hint}</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
            event.target.value = "";
          }}
          className="sr-only"
        />
      </div>
      {message && <p className="mt-2 text-[14px] text-destructive">{message}</p>}
      <ThumbnailGrid files={files} onRemove={onRemove} />
    </div>
  );
}

export function AttachmentsSection({ value, onChange }: AttachmentsSectionProps) {
  const [gbpOpen, setGbpOpen] = React.useState(value.gbpScreenshots.length > 0);

  const update = (patch: Partial<AttachmentsValue>) => onChange({ ...value, ...patch });

  return (
    <Card variant="outlined" className="divide-y divide-hairline p-0">
      <div className="p-6">
        <FieldLabel htmlFor="pasted-text">Paste your ad text, flyer text, or description</FieldLabel>
        <TextArea
          id="pasted-text"
          value={value.pastedText}
          onChange={(event) => update({ pastedText: event.target.value })}
          placeholder="Paste anything you've already written about the business..."
        />
      </div>

      <div className="p-6">
        <FieldLabel>
          Photos
          <span className="ml-1.5 font-normal text-ink-secondary/70">· up to 10 images, 10MB each</span>
        </FieldLabel>
        <Dropzone
          label="Drop images here, or click to browse"
          hint={`${value.images.length}/${MAX_IMAGES} added`}
          files={value.images}
          maxFiles={MAX_IMAGES}
          inputId="attachments-images"
          onFilesAdded={(files) => update({ images: [...value.images, ...files] })}
          onRemove={(index) => update({ images: value.images.filter((_, i) => i !== index) })}
        />
      </div>

      <details
        className="p-6"
        open={gbpOpen}
        onToggle={(event) => setGbpOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-medium text-ink-secondary transition-colors duration-200 ease-out hover:text-ink">
          <Camera className="size-4" aria-hidden="true" />
          Have Google Business Profile screenshots?
        </summary>
        <div className="mt-4">
          <Dropzone
            label="Drop GBP screenshots here, or click to browse"
            hint={`${value.gbpScreenshots.length}/${MAX_IMAGES} added`}
            files={value.gbpScreenshots}
            maxFiles={MAX_IMAGES}
            inputId="attachments-gbp"
            onFilesAdded={(files) => update({ gbpScreenshots: [...value.gbpScreenshots, ...files] })}
            onRemove={(index) =>
              update({ gbpScreenshots: value.gbpScreenshots.filter((_, i) => i !== index) })
            }
          />
        </div>
      </details>
    </Card>
  );
}
