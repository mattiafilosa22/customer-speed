import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * A `next/link` styled as a button. The `Button` primitive renders a real
 * `<button>` (no `asChild`), so for navigation we use this thin wrapper that
 * reuses the same theme-driven utility classes. Single responsibility:
 * presentation of a link that looks like a button (tokens only).
 */
type Variant = "default" | "ghost";
type Size = "md" | "sm";

const VARIANT: Readonly<Record<Variant, string>> = {
  default: "bg-accent text-white hover:bg-accent-ink",
  ghost: "bg-transparent text-ink border border-line hover:bg-accent-soft",
};
const SIZE: Readonly<Record<Size, string>> = {
  md: "min-h-11 px-4 text-[13.5px]",
  sm: "min-h-9 px-3 text-[12px]",
};

export interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
}

export function LinkButton({
  variant = "default",
  size = "md",
  disabled = false,
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-body font-medium",
        "select-none transition-colors cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        disabled && "pointer-events-none opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
