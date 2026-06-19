"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";

import { Button, Checkbox } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { saveCookieConsentAction } from "@/app/cookie-actions";

/**
 * Garante-compliant cookie banner (docs/09 §9.3).
 *
 * - Buttons of EQUAL visual weight: "Accept all", "Reject all", "Manage".
 * - An "X" (close) that equals "Reject all": closing without choosing must NOT
 *   enable tracking — it proceeds without analytics.
 * - Necessary cookies always on (shown disabled-checked in "Manage").
 * - On any choice, calls the Server Action which records proof of consent and
 *   sets the no-re-prompt cookie; then the banner hides locally.
 *
 * Accessibility: the banner is a labelled `role="region"`. "Manage" opens a
 * Radix Dialog which provides a focus trap, ESC-to-close, and aria-modal, and
 * restores focus on close (WCAG 2.1.2, 2.4.3).
 */
export function CookieBanner() {
  const t = useTranslations("cookie");
  const [visible, setVisible] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!visible) return null;

  function decide(analyticsAllowed: boolean) {
    startTransition(async () => {
      await saveCookieConsentAction(analyticsAllowed);
      setManageOpen(false);
      setVisible(false);
    });
  }

  return (
    <div
      role="region"
      aria-label={t("regionLabel")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel p-4 shadow-sm"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg text-ink">{t("title")}</h2>
            <p className="font-body text-[13px] text-ink">
              {t("body")}{" "}
              <Link href="/cookie" className="text-accent hover:underline">
                {t("policyLink")}
              </Link>
            </p>
          </div>
          {/* X = reject (equal to "Reject all": proceed without tracking). */}
          <button
            type="button"
            onClick={() => decide(false)}
            disabled={isPending}
            aria-label={t("close")}
            className="rounded-control p-1 text-muted hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            <span aria-hidden="true" className="font-mono text-lg leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button onClick={() => decide(true)} disabled={isPending} className="sm:w-auto">
            {t("acceptAll")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => decide(false)}
            disabled={isPending}
            className="sm:w-auto"
          >
            {t("rejectAll")}
          </Button>

          <Dialog.Root open={manageOpen} onOpenChange={setManageOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" disabled={isPending} className="sm:w-auto">
                {t("manage")}
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded border border-line bg-panel p-6 shadow-sm">
                <Dialog.Title className="font-display text-xl text-ink">
                  {t("manageTitle")}
                </Dialog.Title>
                <Dialog.Description className="mt-1 font-body text-[13px] text-muted">
                  {t("manageDescription")}
                </Dialog.Description>

                <div className="mt-4 flex flex-col gap-4">
                  <Checkbox
                    label={t("categories.necessary")}
                    checked
                    disabled
                    readOnly
                  />
                  <Checkbox
                    label={t("categories.analytics")}
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                  />
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => decide(false)}
                    disabled={isPending}
                    className="sm:w-auto"
                  >
                    {t("rejectAll")}
                  </Button>
                  <Button
                    onClick={() => decide(analytics)}
                    disabled={isPending}
                    className="sm:w-auto"
                  >
                    {t("savePreferences")}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </div>
  );
}
