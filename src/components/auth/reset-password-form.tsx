"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { resetPasswordAction } from "@/app/[locale]/(auth)/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * Reset-password form: takes the one-time token (from the email link, passed as
 * a hidden field by the page) plus the new password, and calls
 * `resetPasswordAction`. On success it points the user to login (their other
 * sessions were invalidated by the use case bumping `sessionVersion`).
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations();
  const tm = useMessage();
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">{t("auth.resetPassword.success")}</FormAlert>
        <Link href="/login" className="text-center text-[13px] text-accent hover:underline">
          {t("auth.resetPassword.backToLogin")}
        </Link>
      </div>
    );
  }

  const isError = state.status === "error";

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {isError && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}

      <Input
        label={t("auth.fields.newPassword")}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        aria-describedby="newpassword-hint"
        error={
          isError && state.fieldErrors?.newPassword
            ? tm(state.fieldErrors.newPassword)
            : isError && state.fieldErrors?.token
              ? tm(state.fieldErrors.token)
              : undefined
        }
      />
      <p id="newpassword-hint" className="-mt-2 font-body text-[12px] text-muted">
        {t("auth.fields.passwordHint")}
      </p>

      <SubmitButton pendingLabel={t("auth.resetPassword.submitting")}>
        {t("auth.resetPassword.submit")}
      </SubmitButton>
    </form>
  );
}
