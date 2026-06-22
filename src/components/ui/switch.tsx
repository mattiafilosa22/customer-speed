"use client";

import { forwardRef, useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface SwitchProps {
  /** Visible label text (rendered as a real, associated label). */
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  /** Optional helper text linked via `aria-describedby`. */
  description?: string;
  className?: string;
}

/**
 * Accessible toggle switch (docs/05 §5.6): `role="switch"` + `aria-checked`, full
 * keyboard support (Space/Enter via the native <button>), always-visible focus
 * ring, and state communicated NOT by color alone — the knob position changes and
 * the control is labelled. Theme-driven (tokens via Tailwind), presentation only;
 * the parent owns the state.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { label, checked, onCheckedChange, id, disabled = false, description, className },
  ref,
) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = `${switchId}-label`;
  const descId = description ? `${switchId}-desc` : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-3">
        <label id={labelId} htmlFor={switchId} className="font-body text-[13px] text-ink">
          {label}
        </label>
        <button
          ref={ref}
          id={switchId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={labelId}
          aria-describedby={descId}
          disabled={disabled}
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill border transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "border-accent bg-accent" : "border-line bg-line2",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block size-5 rounded-pill bg-panel shadow-sm transition-transform",
              checked ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
      {description ? (
        <p id={descId} className="font-body text-[12px] text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
});
