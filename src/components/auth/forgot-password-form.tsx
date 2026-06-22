"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { requestPasswordResetAction } from "@/app/[locale]/(auth)/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { RecaptchaV2Challenge } from "@/components/auth/recaptcha-v2-challenge";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";
import { useRecaptchaV2 } from "@/components/auth/use-recaptcha-v2";
import { useRecaptchaSubmit } from "@/components/auth/use-recaptcha-submit";

const initialState: ActionState = { status: "idle" };

/**
 * Forgot-password form. Always shows the SAME generic confirmation on submit,
 * whether or not the email exists (no user enumeration, docs/06 §6.1) — the
 * use case guarantees a uniform response.
 */
export function ForgotPasswordForm() {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);
  const needsV2 = state.status === "recaptchaV2Required";
  const v2 = useRecaptchaV2(needsV2);
  const { onSubmit, pending } = useRecaptchaSubmit("forgot_password", formAction, {
    getV2Token: needsV2 && v2.enabled ? v2.getResponse : undefined,
  });

  if (state.status === "success") {
    return <FormAlert tone="success">{t("auth.forgotPassword.success")}</FormAlert>;
  }

  const isError = state.status === "error";

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      {isError && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}

      <Input
        label={t("auth.fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        error={isError && state.fieldErrors?.email ? tm(state.fieldErrors.email) : undefined}
      />

      {needsV2 && v2.enabled ? <RecaptchaV2Challenge containerRef={v2.containerRef} /> : null}

      <SubmitButton pending={pending} pendingLabel={t("auth.forgotPassword.submitting")}>
        {t("auth.forgotPassword.submit")}
      </SubmitButton>

      <div className="text-center font-body text-[13px]">
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.forgotPassword.backToLogin")}
        </Link>
      </div>
    </form>
  );
}
