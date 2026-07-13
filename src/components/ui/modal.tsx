"use client";

import { useState, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import { useThemeContainer } from "@/components/ui/theme-portal";

/**
 * Accessible modal dialog built on Radix Dialog: focus trap, ESC to close,
 * overlay dismiss, focus restoration to the opener — all WCAG-friendly out of
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
  /**
   * Element to focus when the dialog opens, overriding Radix's default (the
   * first tabbable element in the content). Use for confirm dialogs whose
   * first action is destructive — e.g. a "Cancella" confirm button — so the
   * dialog opens with focus on a safe/secondary control instead (WCAG 2.1
   * §3.3, "easy to reverse/confirm"; docs/05 §5.6). Leave unset for the
   * default (first-tabbable) behavior.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  className,
  initialFocusRef,
}: ModalProps) {
  // Portal INTO the theme scope so the dialog surface is correctly dark/light
  // themed (the palette lives on the [data-theme] wrapper; the default body
  // portal would otherwise resolve the light :root tokens in dark mode).
  const container = useThemeContainer();

  // Radix only restores focus to the element opened via `Dialog.Trigger`. Most
  // call sites in this app open the dialog from a `DropdownMenuItem` or a
  // plain state-controlled `Button` (no `trigger` prop) — for those,
  // `context.triggerRef` stays null and focus silently falls back to
  // <body> on close (a WCAG 2.4.3 regression). Capture whatever was focused
  // right before `open` flips to true ourselves, DURING RENDER (the sanctioned
  // "adjust state while rendering" pattern — react.dev/learn/you-might-not-need-an-effect
  // — not an effect, so it runs before Radix's own mount-focus effect on
  // `Dialog.Content` has a chance to move focus into the dialog) and restore it
  // unconditionally on close. This also covers the `trigger`-prop case (the
  // trigger is what's focused right before open), so it's a strict superset of
  // the default Radix behavior.
  const [wasOpen, setWasOpen] = useState(open);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpener(document.activeElement as HTMLElement | null);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="bg-ink/40 fixed inset-0 z-40" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2",
            "border-line bg-panel flex-col gap-4 overflow-y-auto rounded border p-5 shadow",
            "focus-visible:outline-none",
            className,
          )}
          onOpenAutoFocus={
            initialFocusRef
              ? (event) => {
                  event.preventDefault();
                  initialFocusRef.current?.focus();
                }
              : undefined
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener?.focus();
          }}
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
