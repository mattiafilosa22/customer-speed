"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { verifyEmailAction } from "@/app/[locale]/(auth)/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * Email verification (client). The token arrives as a query param; verification
 * is performed via a Server Action (POST), NOT a GET — token-consuming side
 * effects must not be triggerable by link prefetchers/scanners. The action
 * auto-submits once on mount. A polite live region announces the outcome.
 */
export function VerifyEmailClient({ token }: { token: string }) {
  const t = useTranslations();
  const tm = useMessage();
  const [state, formAction] = useActionState(verifyEmailAction, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current || !token) return;
    submittedRef.current = true;
    const form = new FormData();
    form.set("token", token);
    formAction(form);
  }, [token, formAction]);

  if (!token) {
    return <FormAlert tone="error">{t("auth.verifyEmail.missingToken")}</FormAlert>;
  }

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">{t("auth.verifyEmail.success")}</FormAlert>
        <Link href="/login" className="text-center text-[13px] text-accent hover:underline">
          {t("auth.verifyEmail.goToLogin")}
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="error">
          {state.formError ? tm(state.formError) : t("auth.verifyEmail.failed")}
        </FormAlert>
        <Link
          href="/login"
          className="text-center text-[13px] text-accent hover:underline"
        >
          {t("auth.verifyEmail.goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <p role="status" className="font-body text-[13.5px] text-muted">
      {t("auth.verifyEmail.verifying")}
    </p>
  );
}
