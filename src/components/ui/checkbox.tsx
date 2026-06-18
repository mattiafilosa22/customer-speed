import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  /** Visible label content (can include links, e.g. to legal pages). */
  label: ReactNode;
  id?: string;
  /**
   * Error message. When present it is linked via `aria-describedby`,
   * `aria-invalid` is set, and a non-color cue (text) is shown — so the error is
   * not signalled by color alone (docs/05 §5.6, WCAG 1.4.1).
   */
  error?: string;
}

/**
 * Accessible checkbox with an associated <label> and aria-described error.
 * Native control so keyboard + screen-reader behaviour is correct by default.
 * Presentation only; validation is supplied by the parent (`error`).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, error, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          className={cn(
            "mt-0.5 size-4 shrink-0 rounded-input border bg-panel text-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            hasError ? "border-exec" : "border-line",
            className,
          )}
          {...props}
        />
        <label htmlFor={inputId} className="font-body text-[13px] text-ink">
          {label}
        </label>
      </div>
      {hasError ? (
        <p id={errorId} className="font-body text-[12px] text-exec">
          {error}
        </p>
      ) : null}
    </div>
  );
});
