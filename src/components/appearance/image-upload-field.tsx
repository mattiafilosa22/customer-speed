"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui";

const ACCEPTED = "image/png,image/svg+xml";
/** ~1.5MB raw → ~2MB as base64; the server schema also caps the data URL size. */
const MAX_BYTES = 1_500_000;

export interface ImageUploadFieldProps {
  label: string;
  /** Current value: a data URL / http(s) URL, or null when unset. */
  value: string | null;
  onChange: (value: string | null) => void;
  description?: string;
  /** Localized button labels (no hard-coded UI strings here). */
  uploadLabel: string;
  removeLabel: string;
  /** Alt text for the preview image. */
  previewAlt: string;
  className?: string;
}

/**
 * Accessible image picker for brand assets (logo/favicon, docs/05 §5.4). Reads
 * the chosen PNG/SVG into a data URL (storage decision for this phase: no blob
 * storage yet — see schema TODO) and hands it to the parent; never persists by
 * itself. The native file input is labelled and keyboard-operable; the preview
 * has alt text; "Remove" clears the value. Errors are surfaced inline (text, not
 * color-only) and announced.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  description,
  uploadLabel,
  removeLabel,
  previewAlt,
  className,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(`${Math.round(MAX_BYTES / 1000)} KB max`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    onChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview, not a remote asset
          <img
            src={value}
            alt={previewAlt}
            className="size-10 rounded-input border border-line object-contain"
          />
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED}
          onChange={handleChange}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            "min-h-11 flex-1 cursor-pointer rounded-input border border-line bg-panel px-3 py-2",
            "font-body text-[13px] text-ink",
            "file:mr-3 file:rounded-control file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-white",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
          aria-label={uploadLabel}
        />
        {value ? (
          <button
            type="button"
            onClick={handleRemove}
            className="min-h-11 cursor-pointer rounded-control border border-line px-3 font-body text-[13px] text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {removeLabel}
          </button>
        ) : null}
      </div>
      {description ? (
        <p className="font-body text-[12px] text-muted">{description}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="font-body text-[12px] text-exec-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
