"use client";

import { useActionState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui";
import { changePasswordAction } from "@/app/[locale]/(app)/account-actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * Change-password form for the authenticated area. The actor is resolved from
 * the SERVER tenant context (never the client); on success the use case bumped
 * `sessionVersion`, invalidating other sessions. Resets the fields on success.
 */
export function ChangePasswordForm() {
  const t = useTranslations();
  const tm = useMessage();
  const [state, formAction] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  const isError = state.status === "error";

  return (
    <form ref={formRef} action={formAction} noValidate className="flex max-w-md flex-col gap-4">
      {isError && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}
      {state.status === "success" ? (
        <FormAlert tone="success">{t("auth.changePassword.success")}</FormAlert>
      ) : null}

      <Input
        label={t("auth.fields.currentPassword")}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={
          isError && state.fieldErrors?.currentPassword
            ? tm(state.fieldErrors.currentPassword)
            : undefined
        }
      />
      <Input
        label={t("auth.fields.newPassword")}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        aria-describedby="changepw-hint"
        error={
          isError && state.fieldErrors?.newPassword
            ? tm(state.fieldErrors.newPassword)
            : undefined
        }
      />
      <p id="changepw-hint" className="-mt-2 font-body text-[12px] text-muted">
        {t("auth.fields.passwordHint")}
      </p>

      <SubmitButton pendingLabel={t("auth.changePassword.submitting")}>
        {t("auth.changePassword.submit")}
      </SubmitButton>
    </form>
  );
}
