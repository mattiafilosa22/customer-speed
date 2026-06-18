import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  /** Required visible label text (rendered as an associated <label>). */
  label: ReactNode;
  /** Visually hide the label (kept for screen readers) for compact use. */
  hideLabel?: boolean;
  id?: string;
  /** Error message; linked via `aria-describedby`, sets `aria-invalid`. */
  error?: string;
}

/**
 * Accessible multi-line text input with an associated label and aria-described
 * error. Theme-driven, presentation only (validation lives in the form/server).
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hideLabel = false, id, error, className, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={textareaId} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          "rounded-input bg-panel text-ink w-full border px-3 py-2",
          "font-body placeholder:text-muted text-[13.5px]",
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          hasError ? "border-exec" : "border-line",
          className,
        )}
        {...props}
      />
      {hasError ? (
        <p id={errorId} className="font-body text-exec text-[12px]">
          {error}
        </p>
      ) : null}
    </div>
  );
});
