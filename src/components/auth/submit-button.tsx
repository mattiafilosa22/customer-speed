"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui";

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  /** Label shown while idle. */
  children: React.ReactNode;
  /** Label shown while the action is pending (announced to AT via the button). */
  pendingLabel: string;
  /**
   * Force the pending state. Needed for forms submitted MANUALLY (preventDefault
   * + `startTransition`, e.g. the reCAPTCHA flow) where `useFormStatus` never
   * reports pending. OR-combined with the native form status so it also works for
   * plain Server-Action forms.
   */
  pending?: boolean;
}

/**
 * Submit button wired to the parent <form>'s pending state via `useFormStatus`
 * (or an explicit `pending` prop for manually-dispatched forms). While pending it
 * disables, swaps to `pendingLabel`, shows a spinner and sets `aria-busy` so
 * assistive tech announces the loading state (WCAG 4.1.3).
 */
export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingProp,
  ...props
}: SubmitButtonProps) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp || formPending;
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full" {...props}>
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
