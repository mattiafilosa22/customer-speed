import { cn } from "@/lib/cn";

type AlertTone = "error" | "success";

interface FormAlertProps {
  tone: AlertTone;
  children: React.ReactNode;
}

/**
 * Inline form-level message. `role="alert"` for errors (assertive — interrupts
 * to announce the failure) and `role="status"` for success (polite). Tone is
 * conveyed by an icon + text + border, never by color alone (WCAG 1.4.1).
 */
export function FormAlert({ tone, children }: FormAlertProps) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-input border px-3 py-2 font-body text-[13px]",
        isError ? "border-exec text-exec" : "border-ok text-ok",
      )}
    >
      <span aria-hidden="true" className="font-mono font-semibold">
        {isError ? "!" : "✓"}
      </span>
      <span>{children}</span>
    </div>
  );
}
