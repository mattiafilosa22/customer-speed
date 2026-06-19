"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui";
import { withdrawCookieConsentAction } from "@/app/cookie-actions";

/**
 * "Manage / withdraw cookie consent" control for the public Cookie Policy page
 * (GDPR art. 7(3): revoking consent must be as easy as granting it; docs/09
 * §9.3). Clicking it records the withdrawal as proof and clears the consent
 * cookie, so the Garante banner re-appears for a fresh, explicit choice.
 *
 * Accessible: a native button with a polite status message after the action.
 */
export function ManageConsentButton() {
  const t = useTranslations("cookie.managePage");
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function handleClick() {
    setDone(false);
    startTransition(async () => {
      await withdrawCookieConsentAction();
      setDone(true);
    });
  }

  return (
    <section className="mt-2 flex flex-col gap-2">
      <h2 className="font-display text-xl text-ink">{t("title")}</h2>
      <p className="font-body text-[14px] leading-relaxed text-ink">{t("body")}</p>
      <div className="flex items-center gap-3">
        <Button onClick={handleClick} disabled={isPending} className="sm:w-auto">
          {isPending ? t("pending") : t("cta")}
        </Button>
        {done ? (
          <span role="status" className="font-body text-[13px] text-muted">
            {t("done")}
          </span>
        ) : null}
      </div>
    </section>
  );
}
