import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  /** Required visible label text (rendered as an associated <label>). */
  label: ReactNode;
  /** Visually hide the label (kept for screen readers) for inline/compact use. */
  hideLabel?: boolean;
  id?: string;
  /** Error message; linked via `aria-describedby`, sets `aria-invalid`. */
  error?: string;
  children: ReactNode;
}

/**
 * Accessible native <select> with an associated label and aria-described error.
 * Native select keeps full keyboard + mobile support for free (docs/05 §5.6).
 * Theme-driven (tokens via Tailwind utilities), presentation only.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel = false, id, error, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={selectId} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          "rounded-input bg-panel text-ink min-h-11 w-full border px-3",
          "font-body text-[13.5px]",
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
          hasError ? "border-exec" : "border-line",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hasError ? (
        <p id={errorId} className="font-body text-exec-ink text-[12px]">
          {error}
        </p>
      ) : null}
    </div>
  );
});
