import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Coherent empty state (audit P2): a muted micro-icon above a short sentence,
 * centred. Presentation only, theme-driven (muted token). Used by the lead-detail
 * cards ("Aggiornamento dati" / "Appuntamenti" / "Cronologia stage") and any
 * panel that needs a consistent "nothing here yet" affordance.
 *
 * The icon is decorative (`aria-hidden`); the message carries the meaning. A
 * default dotted-circle glyph is used when no icon is provided.
 */
export function EmptyState({
  message,
  icon,
  className,
}: {
  message: string;
  /** Decorative icon node; defaults to a muted glyph. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted flex flex-col items-center justify-center gap-1.5 px-2 py-6 text-center",
        className,
      )}
    >
      <span aria-hidden="true" className="text-[20px] leading-none opacity-70">
        {icon ?? "○"}
      </span>
      <p className="font-body text-[13px]">{message}</p>
    </div>
  );
}
