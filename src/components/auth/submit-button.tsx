"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui";

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  /** Label shown while idle. */
  children: React.ReactNode;
  /** Label shown while the action is pending (announced to AT via the button). */
  pendingLabel: string;
}

/**
 * Submit button wired to the parent <form>'s pending state via `useFormStatus`.
 * Disables + swaps the label while the Server Action runs, and exposes
 * `aria-busy` so assistive tech announces the loading state (WCAG 4.1.3).
 */
export function SubmitButton({ children, pendingLabel, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full" {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
