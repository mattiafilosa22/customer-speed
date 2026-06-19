import { cn } from "@/lib/cn";

interface BrandProps {
  /** White-label platform name (Organization.appName). */
  appName: string;
  className?: string;
}

/**
 * Textual brand mark shown in the sidebar/drawer. Uses the display font and the
 * accent token; the name is the per-tenant `appName` (placeholder in Fase 0).
 * Presentation only.
 */
export function Brand({ appName, className }: BrandProps) {
  return (
    <span
      className={cn(
        "font-display text-[20px] tracking-wide text-accent",
        className,
      )}
    >
      {appName}
    </span>
  );
}
