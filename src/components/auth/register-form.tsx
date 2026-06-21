"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Checkbox, Input } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { registerAction } from "@/app/[locale]/(auth)/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { RecaptchaV2Challenge } from "@/components/auth/recaptcha-v2-challenge";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";
import { useRecaptchaV2 } from "@/components/auth/use-recaptcha-v2";
import { useRecaptchaSubmit } from "@/components/auth/use-recaptcha-submit";

const initialState: ActionState = { status: "idle" };

/**
 * Registration form (client). Collects name/email/password + the two MANDATORY
 * legal consents (privacy + terms), runs reCAPTCHA v3 if configured, and calls
 * `registerAction`. On success it shows a "check your email" confirmation. The
 * consents link to the public legal pages and are recorded as proof of consent
 * server-side (docs/06 §6.5, docs/09 §9.3).
 *
 * NOTE (Fase 1): public self-registration is DISABLED — the public `/register`
 * page returns 404. This component is retained for the upcoming INVITATION-based
 * onboarding flow (and is exercised by tests), not wired to a public route.
 */
export function RegisterForm() {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [state, formAction] = useActionState(registerAction, initialState);
  const needsV2 = state.status === "recaptchaV2Required";
  const v2 = useRecaptchaV2(needsV2);
  const onSubmit = useRecaptchaSubmit("register", formAction, {
    getV2Token: needsV2 && v2.enabled ? v2.getResponse : undefined,
  });

  const isError = state.status === "error";

  if (state.status === "success") {
    return <FormAlert tone="success">{t("auth.register.success")}</FormAlert>;
  }

  const consentLabel = (docKey: "privacy" | "terms") =>
    t.rich(`auth.register.consent.${docKey}`, {
      link: (chunks) => (
        <Link
          href={docKey === "privacy" ? "/privacy" : "/terms"}
          className="text-accent hover:underline"
        >
          {chunks}
        </Link>
      ),
    });

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      {isError && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}

      <Input
        label={t("auth.fields.name")}
        name="name"
        autoComplete="name"
        required
        error={isError && state.fieldErrors?.name ? tm(state.fieldErrors.name) : undefined}
      />
      <Input
        label={t("auth.fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        error={isError && state.fieldErrors?.email ? tm(state.fieldErrors.email) : undefined}
      />
      <Input
        label={t("auth.fields.password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        aria-describedby="password-hint"
        error={
          isError && state.fieldErrors?.password ? tm(state.fieldErrors.password) : undefined
        }
      />
      <p id="password-hint" className="-mt-2 font-body text-[12px] text-muted">
        {t("auth.fields.passwordHint")}
      </p>

      <Checkbox
        name="consentPrivacy"
        label={consentLabel("privacy")}
        error={
          isError && state.fieldErrors?.consentPrivacy
            ? tm(state.fieldErrors.consentPrivacy)
            : undefined
        }
      />
      <Checkbox
        name="consentTerms"
        label={consentLabel("terms")}
        error={
          isError && state.fieldErrors?.consentTerms
            ? tm(state.fieldErrors.consentTerms)
            : undefined
        }
      />

      {needsV2 && v2.enabled ? <RecaptchaV2Challenge containerRef={v2.containerRef} /> : null}

      <SubmitButton pendingLabel={t("auth.register.submitting")}>
        {t("auth.register.submit")}
      </SubmitButton>

      <div className="text-center font-body text-[13px] text-muted">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.register.loginLink")}
        </Link>
      </div>
    </form>
  );
}
