"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

import type { FeatureFlagKey } from "@/lib/feature-flags";
import { Brand } from "@/components/layout/brand";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MiniCalendar } from "@/components/appointments/mini-calendar";
import { CloseIcon, MenuIcon } from "@/components/layout/icons";

interface MobileDrawerProps {
  appName: string;
  /** Feature flags the tenant has enabled (drives nav + mini-calendar). */
  enabledFeatures: ReadonlyArray<FeatureFlagKey>;
}

/**
 * Mobile/tablet navigation drawer built on Radix Dialog: focus trap, ESC to
 * close, overlay click to dismiss, and the hamburger trigger restores focus on
 * close — all accessible out of the box. Shown only below lg; the desktop
 * sidebar takes over above it. The trigger and close are >= 44px touch targets
 * with a visible focus ring. All labels come from the i18n catalogue.
 */
export function MobileDrawer({ appName, enabledFeatures }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const tDrawer = useTranslations("drawer");
  const tNav = useTranslations("nav");
  const showCalendar = enabledFeatures.includes("appointments");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
        aria-label={tDrawer("open")}
      >
        <MenuIcon />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 lg:hidden" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col gap-4 border-r border-line bg-panel p-4 shadow lg:hidden"
          aria-label={tNav("ariaLabel")}
        >
          <div className="flex min-h-11 items-center justify-between px-2">
            <Brand appName={appName} />
            <Dialog.Close
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-muted hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={tDrawer("close")}
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          {/* Visually-hidden title for assistive tech (Radix requires one). */}
          <Dialog.Title className="sr-only">{appName}</Dialog.Title>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
            <nav>
              <SidebarNav
                enabledFeatures={enabledFeatures}
                onNavigate={() => setOpen(false)}
              />
            </nav>
            {showCalendar ? <MiniCalendar onNavigate={() => setOpen(false)} /> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
