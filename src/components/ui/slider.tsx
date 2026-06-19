"use client";

import { forwardRef, useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";

export interface SliderProps {
  /** Visible label text (rendered as an associated <label>). */
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  id?: string;
  /** Optional unit shown next to the value (e.g. "px"). */
  unit?: string;
  /** Optional helper text linked via `aria-describedby`. */
  description?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible range slider built on the native `<input type="range">` so keyboard
 * support (arrows, Home/End), screen-reader value announcement and mobile
 * dragging come for free (docs/05 §5.6). The current value is shown as text next
 * to the label (not color-only). Theme-driven, presentation only.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { label, value, min, max, step = 1, onValueChange, id, unit, description, disabled = false, className },
  ref,
) {
  const generatedId = useId();
  const sliderId = id ?? generatedId;
  const descId = description ? `${sliderId}-desc` : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={sliderId}>{label}</Label>
        <span className="font-mono text-[12px] text-ink" aria-hidden="true">
          {value}
          {unit ? unit : null}
        </span>
      </div>
      <input
        ref={ref}
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={descId}
        aria-valuetext={unit ? `${value}${unit}` : String(value)}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-pill bg-line2 accent-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      {description ? (
        <p id={descId} className="font-body text-[12px] text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
});
