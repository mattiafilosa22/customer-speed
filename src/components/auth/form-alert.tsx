import { cn } from "@/lib/cn";

type AlertTone = "error" | "success" | "warning";

interface FormAlertProps {
  tone: AlertTone;
  children: React.ReactNode;
}

const TONE_CLASSES: Readonly<Record<AlertTone, string>> = {
  error: "border-exec text-exec",
  success: "border-ok text-ok",
  warning: "border-warn text-warn",
};

const TONE_ICON: Readonly<Record<AlertTone, string>> = {
  error: "!",
  success: "✓",
  warning: "▲",
};

/**
 * Inline form-level message. `role="alert"` for errors (assertive — interrupts
 * to announce the failure) and `role="status"` for success/warning (polite).
 * Tone is conveyed by an icon + text + border, never by color alone (WCAG 1.4.1).
 */
export function FormAlert({ tone, children }: FormAlertProps) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-input border px-3 py-2 font-body text-[13px]",
        TONE_CLASSES[tone],
      )}
    >
      <span aria-hidden="true" className="font-mono font-semibold">
        {TONE_ICON[tone]}
      </span>
      <span>{children}</span>
    </div>
  );
}
