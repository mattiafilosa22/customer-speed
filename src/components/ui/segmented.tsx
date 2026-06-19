"use client";

import { useId } from "react";

import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedProps<T extends string> {
  /** Accessible group label (rendered visibly above the control). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Visually hide the group label (kept for screen readers). */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Segmented control implemented as a WAI-ARIA `radiogroup` of native radio
 * inputs (visually styled as segments). Native radios give correct keyboard
 * behaviour (arrow keys move + select within the group, Tab enters/leaves) and
 * screen-reader semantics for free (docs/05 §5.6). Selection is signalled by
 * background AND text weight, not color alone. Theme-driven, presentation only.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onValueChange,
  hideLabel = false,
  className,
}: SegmentedProps<T>) {
  const groupId = useId();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span
        id={`${groupId}-label`}
        className={cn("label-mono text-muted block", hideLabel && "sr-only")}
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="inline-flex rounded-control border border-line bg-bg p-0.5"
      >
        {options.map((option) => {
          const id = `${groupId}-${option.value}`;
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "relative inline-flex min-h-9 cursor-pointer items-center justify-center rounded-control px-3",
                "font-body text-[13px] transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                selected ? "bg-panel font-semibold text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <input
                id={id}
                type="radio"
                name={groupId}
                value={option.value}
                checked={selected}
                onChange={() => onValueChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
