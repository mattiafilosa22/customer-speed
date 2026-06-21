"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * The reCAPTCHA v2 checkbox container, shown only after the server replies
 * `recaptchaV2Required` (a low v3 score, docs/06 §6.2).
 *
 * Accessibility: the explanatory message is in an `aria-live="assertive"` region
 * so screen readers announce the new challenge, and focus moves to it on first
 * appearance so keyboard users land on the widget. The widget itself is rendered
 * by `useRecaptchaV2` into `containerRef`.
 */
export function RecaptchaV2Challenge({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Move focus to the challenge so keyboard/SR users are taken to it.
    wrapperRef.current?.focus();
  }, []);

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      role="group"
      aria-label={t("auth.recaptcha.v2GroupLabel")}
      className="flex flex-col gap-2 outline-none"
    >
      <p role="alert" aria-live="assertive" className="font-body text-[13px] text-muted">
        {t("auth.recaptcha.v2Required")}
      </p>
      <div ref={containerRef} />
    </div>
  );
}
