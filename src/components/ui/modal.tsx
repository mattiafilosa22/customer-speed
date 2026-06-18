"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";

/**
 * Accessible modal dialog built on Radix Dialog: focus trap, ESC to close,
 * overlay dismiss, focus restoration to the trigger — all WCAG-friendly out of
 * the box. Theme-driven surface; presentation only. `title` is required (Radix
 * needs a title for assistive tech); `description` is optional.
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional trigger element rendered inline (uses Radix `asChild`). */
  trigger?: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/40 fixed inset-0 z-40" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2",
            "border-line bg-panel flex-col gap-4 overflow-y-auto rounded border p-5 shadow",
            "focus-visible:outline-none",
            className,
          )}
        >
          <div className="flex flex-col gap-1">
            <Dialog.Title className="font-display text-ink text-xl">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="font-body text-muted text-[13px]">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Dialog as ModalPrimitive };
