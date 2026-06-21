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
 *
 * v2 fallback (docs/06 §6.2): when the server has asked for the checkbox
 * challenge, the form passes `getV2Token` — the current v2 widget response is
 * read synchronously and attached as `recaptchaV2Token` alongside the fresh v3
 * token, so a single resubmit carries both.
 */
export interface RecaptchaSubmitOptions {
  readonly tokenFieldName?: string;
  /** Reads the current v2 checkbox response (null when unsolved/disabled). */
  readonly getV2Token?: () => string | null;
  readonly v2FieldName?: string;
}

export function useRecaptchaSubmit(
  action: string,
  formAction: (formData: FormData) => void,
  options: RecaptchaSubmitOptions = {},
): (event: FormEvent<HTMLFormElement>) => void {
  const { execute } = useRecaptcha();
  const tokenFieldName = options.tokenFieldName ?? "recaptchaToken";
  const v2FieldName = options.v2FieldName ?? "recaptchaV2Token";
  const getV2Token = options.getV2Token;

  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute(action).then((token) => {
      const data = new FormData(form);
      data.set(tokenFieldName, token ?? "");
      if (getV2Token) {
        data.set(v2FieldName, getV2Token() ?? "");
      }
      startTransition(() => formAction(data));
    });
  };
}
