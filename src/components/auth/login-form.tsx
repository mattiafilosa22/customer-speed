"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { loginAction } from "@/app/[locale]/(auth)/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { RecaptchaV2Challenge } from "@/components/auth/recaptcha-v2-challenge";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";
import { useRecaptchaV2 } from "@/components/auth/use-recaptcha-v2";
import { useRecaptchaSubmit } from "@/components/auth/use-recaptcha-submit";

const initialState: ActionState = { status: "idle" };

/**
 * Login form (client). Owns NO business logic: it gathers input, runs reCAPTCHA
 * v3 if configured, and calls the `loginAction` Server Action via
 * `useActionState`. Field/global errors arrive as i18n KEYS and are localized
 * here. Failures are intentionally generic (no user enumeration, docs/06 §6.1).
 */
export function LoginForm({ organizationSlug }: { organizationSlug?: string }) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [state, formAction] = useActionState(loginAction, initialState);
  // After a low v3 score the server replies `recaptchaV2Required`; render the
  // checkbox widget and attach its response on the next submit (docs/06 §6.2).
  const needsV2 = state.status === "recaptchaV2Required";
  const v2 = useRecaptchaV2(needsV2);
  const { onSubmit, pending } = useRecaptchaSubmit("login", formAction, {
    getV2Token: needsV2 && v2.enabled ? v2.getResponse : undefined,
  });

  const isError = state.status === "error";

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      {/* Optional explicit tenant slug (single-domain): defaults server-side to
          DEFAULT_ORG_SLUG when absent. Lets the superAdmin/other tenants sign in
          via /login?org=<slug>; the seam for future subdomain routing. */}
      {organizationSlug ? (
        <input type="hidden" name="organizationSlug" value={organizationSlug} />
      ) : null}

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
      <Input
        label={t("auth.fields.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={
          isError && state.fieldErrors?.password ? tm(state.fieldErrors.password) : undefined
        }
      />

      {needsV2 && v2.enabled ? <RecaptchaV2Challenge containerRef={v2.containerRef} /> : null}

      <SubmitButton pending={pending} pendingLabel={t("auth.login.submitting")}>
        {t("auth.login.submit")}
      </SubmitButton>

      {/* Public self-registration is disabled in Fase 1 (tenants are provisioned
          by the superAdmin / reseller, users via invitation) — so no "register"
          link is shown. See src/app/[locale]/(auth)/register/page.tsx. */}
      <div className="flex flex-col gap-1 text-center font-body text-[13px]">
        <Link href="/forgot-password" className="text-accent hover:underline">
          {t("auth.login.forgotLink")}
        </Link>
      </div>
    </form>
  );
}
