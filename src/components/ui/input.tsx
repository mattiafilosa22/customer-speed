import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Required visible label text (rendered as an associated <label>). */
  label: ReactNode;
  /** Optional explicit id; auto-generated when omitted. */
  id?: string;
  /**
   * Error message. When present, it is rendered, linked via `aria-describedby`,
   * `aria-invalid` is set, and a non-color cue (border + text) is shown so the
   * error is not communicated by color alone (docs/05 §5.6).
   */
  error?: string;
}

/**
 * Accessible text input with an associated label and aria-described error.
 * Single responsibility: render one labelled field. No validation logic here —
 * the parent supplies `error` (Zod errors arrive from the form/server layer).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, id, error, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={inputId}>{label}</Label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          "min-h-11 w-full rounded-input border bg-panel px-3 text-ink",
          "font-body text-[13.5px] placeholder:text-muted",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          hasError ? "border-exec" : "border-line",
          className,
        )}
        {...props}
      />
      {hasError ? (
        <p id={errorId} className="font-body text-[12px] text-exec">
          {error}
        </p>
      ) : null}
    </div>
  );
});
