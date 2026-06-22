import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Visual variants — mapped onto theme tokens, never hard-coded colors. */
export type ButtonVariant = "default" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Squared button style (white-label "Squadrato"): forces radius to 0,
   * overriding the themed control radius. Driven by `Organization.theme` in the
   * appearance panel (later phase); exposed here as a prop.
   */
  squared?: boolean;
}

const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  default:
    "bg-accent text-white hover:bg-accent-ink active:bg-accent-ink disabled:opacity-50",
  ghost:
    "bg-transparent text-ink border border-line hover:bg-accent-soft disabled:opacity-50",
  // Destructive actions (delete, erase). White text stays AA on --danger in
  // both modes; hover dims slightly (mode-agnostic, no extra token needed).
  danger:
    "bg-danger text-white hover:opacity-90 active:opacity-90 disabled:opacity-50",
};

const SIZE_CLASSES: Readonly<Record<ButtonSize, string>> = {
  // Touch target >= 44px on the default size (docs/05 §5.6).
  md: "min-h-11 px-4 text-[13.5px]",
  sm: "min-h-9 px-3 text-[12px]",
};

/**
 * Accessible button primitive. Theme-driven (tokens via Tailwind utilities),
 * single responsibility (presentation only — no business logic), with an
 * always-visible focus ring re-established via `focus-visible`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", squared = false, className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Default to type="button" so a button in a form never submits by accident.
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-body font-medium",
        "select-none transition-colors cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-not-allowed",
        squared ? "rounded-none" : "rounded-control",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
});
