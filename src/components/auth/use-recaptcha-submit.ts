"use client";

import { startTransition, type FormEvent } from "react";

import { useRecaptcha } from "@/components/auth/use-recaptcha";

/**
 * Bridges async reCAPTCHA v3 token retrieval with a React 19 form action driven
 * by `useActionState`.
 *
 * We intercept submit (always preventDefault), fetch the token, set it on the
 * hidden field, build a FormData snapshot and dispatch `formAction` INSIDE a
 * `startTransition`. Dispatching within a transition is what lets React track
 * the action and follow a redirect it throws (e.g. signIn on login) — a bare
 * call outside a transition does not. When reCAPTCHA is disabled (no site key)
 * `execute` resolves to null and the token stays empty (server verifier no-ops).
 */
export function useRecaptchaSubmit(
  action: string,
  formAction: (formData: FormData) => void,
  tokenFieldName = "recaptchaToken",
): (event: FormEvent<HTMLFormElement>) => void {
  const { execute } = useRecaptcha();

  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute(action).then((token) => {
      const data = new FormData(form);
      data.set(tokenFieldName, token ?? "");
      startTransition(() => formAction(data));
    });
  };
}
